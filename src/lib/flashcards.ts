"use client";

import { readError } from "@/lib/remoteStore";
import { getSupabase } from "@/lib/supabaseClient";

/**
 * The flashcard feature's data access.
 *
 * Deliberately not a `remoteStore`. That factory exists for a list the whole
 * app holds in memory and reads synchronously, which is right for words and
 * wrong for this: a deck is asked for once, played, and finished with, and
 * nothing else on the screen needs to watch it. Plain async functions and the
 * caller's own state are the honest shape.
 *
 * Everything here talks to `learning_items` and the two database functions
 * rather than to the compatibility views. A flashcard is drawn from every
 * content type at once, which is the thing the old three-table arrangement
 * could not do, so there is no reason for this to pretend otherwise.
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
  categoryIds: string[];
  needsReviewOnly: boolean;
  /** Blank means "no preference", which is what makes the default apply. */
  size: number | null;
};

/**
 * How many ids travel in one `in (...)`.
 *
 * The same 200 `remoteStore` settled on, and for the same measured reason:
 * ids go in the query string, so a long list becomes a long request line and
 * a gateway in front of the database is entitled to refuse it. A deck can hold
 * 500 cards, so this is reached in ordinary use rather than in theory.
 */
const ID_BATCH = 200;

/** What the reader gets when they ask for a deck without saying how big. */
export const DEFAULT_DECK_SIZE = 50;

export type Category = { id: string; name: string };

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
 * match the check constraint on
 * `review_logs.outcome`.
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
  sources: string[];
  category_ids: string[];
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
    sources: chosen.has("all") ? [] : types,
    category_ids: request.categoryIds,
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

/** The categories a filter can offer: the reader's own, in their own order. */
export async function listCategories(): Promise<Category[]> {
  const { data, error } = await client()
    .from("tags")
    .select("id, name")
    .eq("kind", "category")
    .order("position")
    .order("name");

  if (error) throw new FlashcardError(`Could not read your categories: ${readError(error)}.`);
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
    .from("card_faces")
    .select("id", { count: "exact", head: true })
    // A card with nothing on its back cannot be answered, so it is not a
    // card. A word saved without its definition yet is the usual case.
    .not("back", "is", null)
    .neq("back", "");

  if (options.sources.length > 0) query = query.in("item_type", options.sources);
  if (options.only_needs_review) query = query.eq("needs_review", true);

  const { count, error } = await query;
  if (error) throw new FlashcardError(`Could not count your items: ${readError(error)}.`);

  // Categories are a join and cannot be expressed here without one, so a
  // filtered count is deliberately not offered: a number that ignored the
  // category filter would be worse than no number. The dialog says as much.
  return count ?? 0;
}

/** Builds the deck and hands back its id. One round trip; the work is server-side. */
export async function buildDeck(request: DeckRequest): Promise<string> {
  const { data, error } = await client().rpc("build_flashcard_deck", {
    ...toDeckRequest(request),
    deck_name: "",
  });

  if (error) throw new FlashcardError(`Could not build the deck: ${readError(error)}.`);
  if (!data) throw new FlashcardError("The deck came back empty.");
  return String(data);
}

/**
 * The cards in a deck, in order.
 *
 * Two queries rather than one embedded select, because `card_faces` is a view
 * and PostgREST will not infer a relationship to one. Two small round trips
 * are a fair price for the type-specific work staying in the database.
 */
export async function loadDeck(deckId: string): Promise<Card[]> {
  const supabase = client();

  const { data: entries, error: entriesError } = await supabase
    .from("deck_items")
    .select("item_id")
    .eq("deck_id", deckId)
    .order("position");

  if (entriesError) {
    throw new FlashcardError(`Could not read the deck: ${readError(entriesError)}.`);
  }
  const order = entries ?? [];
  if (order.length === 0) return [];

  // In batches, for the reason `remoteStore` gives where it does the same
  // thing: every id travels in the URL at roughly 37 bytes, and a deck of 500
  // would put 19 KB in a request line that a gateway is entitled to refuse.
  const ids = order.map((row) => String(row.item_id));
  const faces: Record<string, unknown>[] = [];
  for (let from = 0; from < ids.length; from += ID_BATCH) {
    const { data, error } = await supabase
      .from("card_faces")
      .select("id, item_type, front, back, needs_review")
      .in("id", ids.slice(from, from + ID_BATCH));

    if (error) {
      throw new FlashcardError(`Could not read the cards: ${readError(error)}.`);
    }
    faces.push(...(data ?? []));
  }

  const byId = new Map(
    faces.map((row) => [
      String(row.id),
      {
        itemType: String(row.item_type),
        front: String(row.front ?? ""),
        back: String(row.back ?? ""),
        needsReview: row.needs_review === true,
      },
    ]),
  );

  // Ordered by the deck, not by the second query: `in` makes no promise about
  // the order it returns rows in, and the deck's order is the whole point.
  return order
    .map((row) => {
      const face = byId.get(String(row.item_id));
      if (!face) return null;
      return { id: String(row.item_id), ...face };
    })
    .filter((card): card is Card => card !== null);
}

/**
 * The reader's own calendar day, as `YYYY-MM-DD`.
 *
 * Built by hand rather than with `toISOString`, which would give the UTC day:
 * a review at eleven at night in Europe belongs to the day the reader thinks
 * it does, not to tomorrow. This is the only input to the streak, and it
 * cannot be recomputed afterwards, because `daily_study` is a counter and the
 * reader's offset is stored nowhere. Exported so that it can be tested, which
 * it could not be while it lived inside an async function that needs a
 * database.
 */
export function localDayOf(when: Date): string {
  return [
    when.getFullYear(),
    String(when.getMonth() + 1).padStart(2, "0"),
    String(when.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Records one answer: the review log, the schedule, the deck, the day's
 * count, all in the one transaction inside `apply_review`.
 *
 * The reader's own date is passed rather than left to the server, because a
 * review at eleven at night belongs to the day they think it does and the
 * server is somewhere else.
 */
export async function answerCard(
  itemId: string,
  outcome: Outcome,
  deckId: string,
  tookMs: number | null,
): Promise<void> {
  const { error } = await client().rpc("apply_review", {
    target_item: itemId,
    answer: outcome,
    deck: deckId,
    took_ms: tookMs,
    local_day: localDayOf(new Date()),
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
 * Written straight to `learning_items` rather than through a store: the three
 * list stores read the compatibility views and hold their rows in memory, and
 * a flag flipped from the review screen would leave those caches stale until
 * the next read. The review screen is the honest place to set this, because it
 * is where you find out.
 */
export async function setNeedsReview(itemId: string, value: boolean): Promise<void> {
  const { error } = await client()
    .from("learning_items")
    .update({ needs_review: value })
    .eq("id", itemId);

  if (error) {
    throw new FlashcardError(`Could not mark that item: ${readError(error)}.`);
  }
}
