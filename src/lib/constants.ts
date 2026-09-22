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
] as const;

/** What a new account marks answers with: a comma or a slash means "or". */
export const DEFAULT_ANSWER_SEPARATORS = ",/";

/**
 * Keeps only the characters that are actually on offer, in the order they are
 * offered, without repeats. Anything else a row or a backup file carries is
 * dropped rather than trusted.
 */
export function readSeparators(value: unknown): string {
  const given = typeof value === "string" ? value : "";
  return SEPARATOR_CHOICES.filter((choice) => given.includes(choice.character))
    .map((choice) => choice.character)
    .join("");
}
