"use client";

import { readError } from "@/lib/remoteStore";
import { getSupabase } from "@/lib/supabaseClient";
import { readTenses, readVerbRows } from "@/lib/types";

/**
 * The flashcard feature's data access.
 *
 * Deliberately not a `remoteStore`. That factory exists for a list the whole
 * app holds in memory and reads synchronously, which is right for words and
 * wrong for this: a deck is asked for once, played, and finished with, and
 * nothing else on the screen needs to watch it. Plain async functions and the
 * caller's own state are the honest shape.
 *
 * Everything here talks to `items`, `deck_cards` and the two database
 * functions, `build_deck` and `record_review`. A flashcard is drawn from every
 * content type at once, and every type lives in the one table.
 */

/**
 * What a deck may be drawn from.
 *
 * `all` and `recent` are not content types, which is why this is not simply
 * the `item_type` column: `all` means put no restriction on type, and
 * `recent` changes the ordering rather than the filter. `toDeckRequest`
 * untangles them, in one place, so no caller has to remember which is which.
 */
export type CardSource = "all" | "word" | "phrase" | "verb_table" | "recent";

export const SOURCE_LABELS: Record<CardSource, string> = {
  all: "All items",
  word: "Words only",
  phrase: "Phrases only",
  verb_table: "Verbs only",
  recent: "Most recently added",
};

/** The order they are offered in, with the default first. */
export const SOURCE_ORDER: CardSource[] = ["all", "word", "phrase", "verb_table", "recent"];

export type DeckRequest = {
  sources: CardSource[];
  collectionIds: string[];
  needsReviewOnly: boolean;
  /** Blank means "no preference", which is what makes the default apply. */
  size: number | null;
};

/** What the reader gets when they ask for a deck without saying how big. */
export const DEFAULT_DECK_SIZE = 50;

export type Collection = { id: string; name: string };

export type Card = {
  id: string;
  itemType: string;
  front: string;
  back: string;
  /**
   * Whether this item is already flagged for another look. Carried because
   * the checkbox on the card shows it: starting every card unticked meant a
   * deck built from "only items marked as needing review" showed a row of
   * empty boxes, and a click there cleared a mark the reader never set in
   * that session.
   */
  needsReview: boolean;
};

/**
 * What the reader did with a card.
 *
 * Four, not a boolean, because the three buttons an unknown card offers are
 * three different things to have done. "Try again" is not "I looked it up",
 * and neither is "move on"; a scheduler that treats them the same is throwing
 * away what it was told.
 *
 * Three of the four are produced today. `skipped` is carried because the
 * scheduler already treats it as its own case, holding the streak while
 * zeroing the interval, and a screen that offers "not now" is the obvious
 * next one to build; it is headroom, not a path anybody takes. The names
 * match the check constraint on `reviews.outcome`.
 */
export type Outcome = "correct" | "again" | "revealed" | "skipped";

/** Thrown with a sentence already fit to show. */
export class FlashcardError extends Error {}

function client() {
  const supabase = getSupabase();
  if (!supabase) {
    throw new FlashcardError("This build has no database credentials, so flashcards cannot be made.");
  }
  return supabase;
}

/**
 * Turns what the reader ticked into what the database function takes.
 *
 * Pure, and exported for its test: this is the only place that knows `all`
 * means an empty list and `recent` is an ordering. Getting it wrong would
 * silently build the wrong deck rather than fail, which is the kind of bug
 * that is noticed weeks later if at all.
 */
export function toDeckRequest(request: DeckRequest): {
  item_types: string[];
  tag_ids: string[];
  only_needs_review: boolean;
  only_recent: boolean;
  size: number;
} {
  const chosen = new Set(request.sources);
  const types = ["word", "phrase", "verb_table"].filter((type) =>
    chosen.has(type as CardSource),
  );

  return {
    // Empty means every type. "All items" says so outright, and so does
    // picking nothing at all, which is the same request phrased by omission.
    item_types: chosen.has("all") ? [] : types,
    tag_ids: request.collectionIds,
    only_needs_review: request.needsReviewOnly,
    only_recent: chosen.has("recent"),
    size: sizeOf(request.size),
  };
}

/** The requested size, or the default, clamped to what the database accepts. */
export function sizeOf(size: number | null): number {
  if (size === null || !Number.isFinite(size) || size <= 0) return DEFAULT_DECK_SIZE;
  return Math.min(500, Math.max(1, Math.floor(size)));
}

/**
 * The collections a filter can offer: the reader's own, alphabetically, which
 * is the order Settings shows them in.
 */
export async function listCollections(): Promise<Collection[]> {
  const { data, error } = await client()
    .from("tags")
    .select("id, name")
    .eq("context", "collection")
    .order("name");

  if (error) throw new FlashcardError(`Could not read your collections: ${readError(error)}.`);
  return (data ?? []).map((row) => ({ id: String(row.id), name: String(row.name) }));
}

/**
 * How many items a set of filters would draw from, so the reader can see
 * whether asking for fifty is optimistic before they ask for it.
 *
 * `head: true` with an exact count, so this is a count on the server and no
 * rows come back over the wire.
 */
export async function countMatching(request: DeckRequest): Promise<number> {
  const options = toDeckRequest(request);

  let query = client()
    .from("items")
    .select("id", { count: "exact", head: true })
    // A card with nothing on its back cannot be answered, so it is not a
    // card. A word saved without its definition yet is the usual case.
    // `has_answer` is the database's copy of the rule `cardBack` applies.
    .eq("has_answer", true);

  if (options.item_types.length > 0) query = query.in("item_type", options.item_types);
  if (options.only_needs_review) query = query.eq("needs_review", true);

  const { count, error } = await query;
  if (error) throw new FlashcardError(`Could not count your items: ${readError(error)}.`);

  // Collections are a join and cannot be expressed here without one, so a
  // filtered count is deliberately not offered: a number that ignored the
  // collection filter would be worse than no number. The dialog says as much.
  return count ?? 0;
}

/** Builds the deck and hands back its id. One round trip; the work is server-side. */
export async function buildDeck(request: DeckRequest): Promise<string> {
  const { data, error } = await client().rpc("build_deck", toDeckRequest(request));

  if (error) throw new FlashcardError(`Could not build the deck: ${readError(error)}.`);
  if (!data) throw new FlashcardError("The deck came back empty.");
  return String(data);
}

/** The columns a card is built from. */
type CardItem = {
  item_type: string;
  title: string;
  definition: string | null;
  literal_meaning: string | null;
  usage_example: string | null;
  tenses: string[] | null;
  verb_rows: unknown;
};

/**
 * What a conjugation with nothing written in it shows on a card. Words rather
 * than a symbol, so the card reads the same to anyone.
 */
const EMPTY_CONJUGATION = "(not filled in)";

/**
 * The back of a card, from the item's own fields: a word's definition, a
 * phrase's meaning and example, or a verb's conjugations one person per line.
 *
 * This used to be built in the database, in a view, and is built here now
 * that the view is gone. Its one rule the database still needs, whether a
 * card has a back at all, is kept there as `items.has_answer` so a deck can
 * be filled without sending every item to the browser. The two must agree;
 * `flashcards.test.ts` checks this function against that rule.
 *
 * A verb row is read against the tenses with `readVerbRows`, the same reader
 * the conjugation table uses, so `conjugations[i]` lines up with `tenses[i]`
 * here exactly as it does on screen.
 */
export function cardBack(item: CardItem): string {
  switch (item.item_type) {
    case "word":
      return item.definition ?? "";
    case "phrase":
      return [item.literal_meaning, item.usage_example]
        .filter((part): part is string => !!part)
        .join("\n\n");
    case "verb_table": {
      const tenses = readTenses(item.tenses);
      return readVerbRows(item.verb_rows, tenses.length)
        .map((row) => {
          const said = tenses
            .map((tense, at) => [tense, row.conjugations[at]] as const)
            .filter(([, conjugation]) => conjugation.trim() !== "")
            .map(([tense, conjugation]) => `${tense} ${conjugation}`.trim());
          return `${row.person}: ${said.length > 0 ? said.join("  ·  ") : EMPTY_CONJUGATION}`;
        })
        .join("\n");
    }
    default:
      return "";
  }
}

/**
 * The cards in a deck, in order. One request: `deck_cards` embeds its items
 * through the composite foreign key, and the back is built by `cardBack`.
 *
 * A deck pruned in another tab (only the newest ten are kept) reads as no
 * cards rather than as an error.
 */
export async function loadDeck(deckId: string): Promise<Card[]> {
  const { data, error } = await client()
    .from("deck_cards")
    .select(
      "position, items(id, item_type, title, definition, literal_meaning, usage_example, tenses, verb_rows, needs_review)",
    )
    .eq("deck_id", deckId)
    .order("position");

  if (error) throw new FlashcardError(`Could not read the deck: ${readError(error)}.`);

  return (data ?? [])
    .map((row) => {
      const item = (row as { items?: unknown }).items as
        | (CardItem & { id: string; needs_review: boolean })
        | null;
      if (!item) return null;
      return {
        id: String(item.id),
        itemType: String(item.item_type),
        front: String(item.title ?? ""),
        back: cardBack(item),
        needsReview: item.needs_review === true,
      };
    })
    .filter((card): card is Card => card !== null);
}

/**
 * Records one answer: the review, and the item's new place in the schedule,
 * in the one transaction inside `record_review`.
 *
 * No date is sent. A study day is worked out when a history is drawn, from
 * each review's timestamp and the reader's own time zone, rather than stored
 * as a counter nobody can correct afterwards.
 */
export async function answerCard(
  itemId: string,
  outcome: Outcome,
  tookMs: number | null,
): Promise<void> {
  const { error } = await client().rpc("record_review", {
    target_item: itemId,
    answer: outcome,
    took_ms: tookMs,
  });

  if (error) throw new FlashcardError(`Could not record that answer: ${readError(error)}.`);
}

/**
 * What the "needs review" flag should be once a card has been answered, or
 * `null` when it should be left exactly as it is.
 *
 * The flag is evidence, and answering is how evidence arrives. Getting a card
 * wrong sets it, which is the point of the box: a filter that only collects
 * what somebody remembered to tick collects almost nothing. Getting it right
 * clears it again, because an item that keeps coming back after it is known
 * is the filter wasting the reader's time, and nothing else would ever take
 * it off the list short of editing the entry.
 *
 * The exception is a reader who has touched the box themselves on this card.
 * Ticking it while answering correctly is a deliberate "keep this one, I was
 * not sure", and an app that undid that a second later would be arguing with
 * them. Their choice stands.
 *
 * A pure function rather than a branch inside the component, because it is a
 * rule about what the reader meant rather than about rendering, and this way
 * it can be read and tested on its own.
 */
export function flagAfterAnswer({
  correct,
  flagged,
  touchedByReader,
}: {
  correct: boolean;
  /** What the box shows right now. */
  flagged: boolean;
  /** Whether the reader has changed it themselves on this card. */
  touchedByReader: boolean;
}): boolean | null {
  if (touchedByReader) return null;
  if (correct) return flagged ? false : null;
  return flagged ? null : true;
}

/**
 * Marks an item as wanting another look, or clears the mark.
 *
 * Written straight to `items` rather than through a store. The list stores do
 * not hold the flag, and their saves leave it alone (`save_items` keeps it
 * when the key is absent), so a stale list cannot undo a mark made here. The
 * review screen is the honest place to set this, because it is where you find
 * out.
 */
export async function setNeedsReview(itemId: string, value: boolean): Promise<void> {
  const { error } = await client()
    .from("items")
    .update({ needs_review: value })
    .eq("id", itemId);

  if (error) {
    throw new FlashcardError(`Could not mark that item: ${readError(error)}.`);
  }
}
