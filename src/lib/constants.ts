/**
 * What the word form offers before anyone has changed anything.
 *
 * These used to be *the* lists, edited here and redeployed. They are now the
 * starting point: Settings keeps a per-account copy of each in
 * `public.user_settings`, and an account with no row there falls back to what
 * is written below. Editing this file therefore changes what a new account
 * begins with, not what an existing one sees.
 */

export const DEFAULT_SOURCES = ["Manual", "Google", "Claude", "ChatGPT"] as const;

/**
 * A source is whatever the reader has called one, so this is a plain string
 * rather than a union of the four above. The database agrees: the column is
 * checked for being non-blank and nothing more.
 */
export type Source = string;

export const DEFAULT_SOURCE: Source = "Manual";

/** The groups a word can be filed under, before Settings has been touched. */
export const DEFAULT_CATEGORIES = [
  "Nature",
  "Home",
  "Careers",
  "Office",
  "Food",
  "Travel",
  "People",
  "Health",
] as const;

/** How many categories one word may carry. Not the size of the list to pick from. */
export const MAX_CATEGORIES = 3;

/** A guard against a runaway list, matching the check constraint on the table. */
export const MAX_LIST_LENGTH = 30;

/**
 * The longest word the sorting skip list takes. Articles are a few letters;
 * this is a guard, matching the check constraint, not a considered maximum.
 */
export const MAX_SKIP_WORD = 20;


/**
 * The characters that can be chosen as answer separators, and what to call
 * them. A fixed set rather than a free text box, for the reason the check
 * constraint in the migration gives: a letter in here would split every
 * answer containing that letter, and marking would quietly stop working in a
 * way nobody would connect to a settings change made weeks earlier.
 */
export const SEPARATOR_CHOICES = [
  { character: ",", label: "Comma", example: "gladly, willingly" },
  { character: "/", label: "Slash", example: "gladly/willingly" },
  { character: ";", label: "Semicolon", example: "gladly; willingly" },
  { character: "|", label: "Pipe", example: "gladly | willingly" },
  /*
   * Not a separator in the same sense as the others: the rest split one
   * answer from the next, and this says a part of an answer may be left out
   * altogether. It sits with them because it is the same question to a reader
   * writing entries, which is "what punctuation here is not part of what I
   * mean?", and because it is answered the same way.
   */
  { character: "()", label: "Brackets", example: "to go (on foot)" },
] as const;

/** What a new account marks answers with. */
export const DEFAULT_ANSWER_SEPARATORS = ",/()";

/**
 * Keeps only what is actually on offer, in the order it is offered, without
 * repeats. Anything else a row or a backup file carries is dropped rather
 * than trusted.
 *
 * Matched on the first character of each choice, so the pair of brackets is
 * recognised by its opening one. A stored value is then readable as what it
 * means without the reader having to hold both halves.
 */
export function readSeparators(value: unknown): string {
  const given = typeof value === "string" ? value : "";
  return SEPARATOR_CHOICES.filter((choice) => given.includes(choice.character[0]))
    .map((choice) => choice.character)
    .join("");
}
