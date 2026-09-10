/**
 * What the term form offers before anyone has changed anything.
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

/** The groups a term can be filed under, before Settings has been touched. */
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

/** How many categories one term may carry. Not the size of the list to pick from. */
export const MAX_CATEGORIES = 3;

/** A guard against a runaway list, matching the check constraint on the table. */
export const MAX_LIST_LENGTH = 30;

/**
 * Sorts by the order the reader has put their sources in, not alphabetically —
 * the list is a rough order of trust, and sorting it A to Z would lose that.
 * Anything no longer on the list sorts last.
 */
export function sourceOrder(source: Source, sources: readonly string[]): number {
  const index = sources.findIndex(
    (candidate) => candidate.toLocaleLowerCase() === source.toLocaleLowerCase(),
  );
  return index === -1 ? sources.length : index;
}
