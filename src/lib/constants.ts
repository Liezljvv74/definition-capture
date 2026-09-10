/**
 * The single place to edit the dropdown options used across the app.
 * Add, rename, or reorder entries here and every form follows.
 */

export const SOURCES = ["Manual", "Google", "Claude", "ChatGPT"] as const;

export type Source = (typeof SOURCES)[number];

export const DEFAULT_SOURCE: Source = "Manual";

/**
 * The groups a term can be filed under. Edit this list and both the form and
 * the filter follow. Names already saved on a term survive a change here:
 * they keep showing and stay filterable, they are simply no longer offered.
 */
export const CATEGORIES = [
  "Nature",
  "Home",
  "Careers",
  "Office",
  "Food",
  "Travel",
  "People",
  "Health",
] as const;

/** Enforced in the form, in `storage.ts`, and by a check constraint. */
export const MAX_CATEGORIES = 3;

/** Sorts by the order the list above is written in, not alphabetically. */
export function sourceOrder(source: Source): number {
  const index = SOURCES.indexOf(source);
  return index === -1 ? SOURCES.length : index;
}
