/**
 * The single place to edit the dropdown options used across the app.
 * Add, rename, or reorder entries here and every form follows.
 */

export const SOURCES = ["Manual", "Google", "Claude", "ChatGPT"] as const;

export type Source = (typeof SOURCES)[number];

export const DEFAULT_SOURCE: Source = "Manual";

/** Sorts by the order the list above is written in, not alphabetically. */
export function sourceOrder(source: Source): number {
  const index = SOURCES.indexOf(source);
  return index === -1 ? SOURCES.length : index;
}
