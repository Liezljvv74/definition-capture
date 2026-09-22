"use client";

import { DEFAULT_ANSWER_SEPARATORS } from "@/lib/constants";
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

/** What the reader gets when they ask for a deck without saying how big. */
export const DEFAULT_DECK_SIZE = 50;

export type Category = { id: string; name: string };

export type Card = {
  id: string;
  itemType: string;
  front: string;
  back: string;
  position: number;
};

/**
 * What the reader did with a card.
 *
 * Four, not a boolean, because the three buttons an unknown card offers are
 * three different things to have done. "Try again" is not "I looked it up",
 * and neither is "move on"; a scheduler that treats them the same is throwing
 * away what it was told. The names match the check constraint on
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
    .select("item_id, position")
    .eq("deck_id", deckId)
    .order("position");

  if (entriesError) {
    throw new FlashcardError(`Could not read the deck: ${readError(entriesError)}.`);
  }
  const order = entries ?? [];
  if (order.length === 0) return [];

  const { data: faces, error: facesError } = await supabase
    .from("card_faces")
    .select("id, item_type, front, back")
    .in("id", order.map((row) => String(row.item_id)));

  if (facesError) {
    throw new FlashcardError(`Could not read the cards: ${readError(facesError)}.`);
  }

  const byId = new Map(
    (faces ?? []).map((row) => [
      String(row.id),
      {
        itemType: String(row.item_type),
        front: String(row.front ?? ""),
        back: String(row.back ?? ""),
      },
    ]),
  );

  // Ordered by the deck, not by the second query: `in` makes no promise about
  // the order it returns rows in, and the deck's order is the whole point.
  return order
    .map((row, at) => {
      const face = byId.get(String(row.item_id));
      if (!face) return null;
      return { id: String(row.item_id), position: at + 1, ...face };
    })
    .filter((card): card is Card => card !== null);
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
  const today = new Date();
  const localDay = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  const { error } = await client().rpc("apply_review", {
    target_item: itemId,
    answer: outcome,
    deck: deckId,
    took_ms: tookMs,
    local_day: localDay,
  });

  if (error) throw new FlashcardError(`Could not record that answer: ${readError(error)}.`);
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

/* ------------------------------------------------------- judging an answer */

/**
 * The comparable form of an answer.
 *
 * Case and surrounding punctuation are noise: "Door." and "door" are the same
 * answer. Whitespace is collapsed so a stray double space is not a mistake.
 *
 * Accents are deliberately kept. This is an app for learning a language where
 * `Tür` and `Tur` are different words, and quietly accepting one for the other
 * would teach the wrong thing. `normalize("NFC")` only settles how an accent
 * is encoded, not whether it is there.
 */
export function normaliseAnswer(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[.,;:!?"'()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * How alike two strings are, from 0 to 1, by edit distance over the longer of
 * them. Used only to forgive a typo, never to accept a different answer.
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  // One row at a time rather than the whole matrix: these are short strings,
  // but there is no reason to hold a table of them.
  let previous = Array.from({ length: b.length + 1 }, (_, at) => at);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }

  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

/**
 * Close enough to count as a typo rather than a different answer. At 0.85 a
 * ten-character answer may be one character out; a short one must be exact,
 * which is right, because in a short word every character is most of it.
 */
const CLOSE_ENOUGH = 0.85;

/**
 * What `judgeAnswer` uses when nobody says otherwise.
 *
 * The real answer is per account, chosen in Settings and read from the
 * settings store by the review screen. This is the fallback for a caller that
 * has no settings to hand, and the value a new account starts with.
 */
export { DEFAULT_ANSWER_SEPARATORS as ANSWER_SEPARATORS } from "@/lib/constants";

/** A character class matching any of them, escaped for use inside one. */
function separatorPattern(separators: string): RegExp {
  return new RegExp(`[${separators.replace(/[\\\]^-]/g, (c) => `\\${c}`)}]`, "g");
}

/**
 * The same text with any bracketed aside taken out.
 *
 * A definition often qualifies itself: "to go (on foot)". The part in
 * brackets is a note about when the word applies, not part of the answer, so
 * both readings count. Answering with the brackets works already, because
 * normalising turns them into spaces; this is what makes answering without
 * them work too.
 *
 * Innermost brackets only, and no attempt at nesting. A definition with
 * brackets inside brackets is not a thing this app has, and a regex that
 * tried would be harder to read than the problem deserves.
 */
function withoutAsides(text: string): string {
  return text.replace(/\([^()]*\)/g, " ");
}

/** The same string, or near enough to be a typo rather than another answer. */
function alike(given: string, candidate: string): boolean {
  return given === candidate || similarity(given, candidate) >= CLOSE_ENOUGH;
}

/**
 * Whether what was typed is some combination of the alternatives, in any
 * order, and nothing else.
 *
 * Commas have already become spaces by the time this runs, which is what
 * makes "gladly, willingly" and "gladly willingly" the same thing to it.
 * Written so that an alternative may be several words: it eats the longest
 * thing it recognises from the front and tries again with the rest, and each
 * alternative may be used once.
 *
 * Exact rather than forgiving, deliberately. A typo inside one of several
 * run-together answers cannot be told apart from a different answer without
 * guessing where one ends and the next begins, and guessing is how a marker
 * starts accepting things nobody wrote.
 */
function madeOf(given: string, alternatives: readonly string[]): boolean {
  if (given === "") return true;

  return alternatives.some((alternative, at) => {
    if (alternative === "") return false;
    if (given === alternative) return true;
    if (!given.startsWith(`${alternative} `)) return false;

    const rest = alternatives.filter((_, other) => other !== at);
    return madeOf(given.slice(alternative.length + 1), rest);
  });
}

/**
 * Whether a typed answer matches the back of the card.
 *
 * The back is not always one thing, in two different ways.
 *
 * It may be several lines: a phrase carries its literal meaning and an
 * example separated by a blank line, and a verb table is a line per person.
 * Nobody is going to type all of that, so each line counts on its own.
 *
 * And a line may offer alternatives, separated by a comma or a slash. `gerne`
 * means "gladly, willingly", and somebody who answers "gladly" knows the word.
 * Requiring both, in that order, with the comma, tests whether they can
 * reproduce a glossary entry rather than whether they know what it means. So
 * any one of the alternatives is accepted, as is any combination of them, in
 * any order, with or without the separators.
 *
 * A line may also qualify itself in brackets: "to go (on foot)". The aside
 * says when the word applies rather than what it means, so the answer counts
 * with it and without it.
 *
 * Each line is therefore tried twice, as written and with its asides removed,
 * and each reading is tried whole and split into alternatives. Two readings
 * of two shapes is four passes over a short string, which is nothing, and the
 * alternative is a single expression nobody could check by eye.
 *
 * Otherwise this stays strict rather than clever. A reader told they were
 * wrong can try again, reveal the answer, or carry on, so the cost of
 * refusing a near miss is a button press; the cost of accepting a wrong
 * answer is being told they know something they do not.
 */
export function judgeAnswer(
  typed: string,
  back: string,
  separators: string = DEFAULT_ANSWER_SEPARATORS,
): boolean {
  const given = normaliseAnswer(typed);
  if (given === "") return false;

  const pattern = separatorPattern(separators);

  for (const line of [back, ...back.split("\n")]) {
    for (const reading of [line, withoutAsides(line)]) {
      // The separators become spaces here, so "gladly/willingly" typed out in
      // full matches however the reader punctuated it.
      const whole = normaliseAnswer(reading.replace(pattern, " "));
      if (whole === "") continue;
      if (alike(given, whole)) return true;

      const alternatives = reading
        .split(pattern)
        .map(normaliseAnswer)
        .filter((alternative) => alternative !== "");
      if (alternatives.length < 2) continue;

      // One of them on its own, typo and all.
      if (alternatives.some((one) => alike(given, one))) return true;

      // Or several of them together.
      if (madeOf(given, alternatives)) return true;
    }
  }

  return false;
}
