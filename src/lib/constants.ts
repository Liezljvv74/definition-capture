/**
 * The single place to edit the dropdown options used across the app.
 * Add, rename, or reorder entries here and every form + filter follows.
 */

export const MODULE_TAGS = [
  "Week 1",
  "Week 2",
  "Week 3",
  "Week 4",
  "Week 5",
  "Week 6",
  "Week 7",
  "Week 8",
  "Unsorted",
] as const;

export type ModuleTag = (typeof MODULE_TAGS)[number];

export const DEFAULT_MODULE_TAG: ModuleTag = "Unsorted";

export const SOURCES = ["Manual", "Google", "Claude", "ChatGPT"] as const;

export type Source = (typeof SOURCES)[number];

export const DEFAULT_SOURCE: Source = "Manual";

/** Sort helper so "Week 2" lands before "Week 10" and "Unsorted" keeps its place. */
export function moduleTagOrder(tag: ModuleTag): number {
  const index = MODULE_TAGS.indexOf(tag);
  return index === -1 ? MODULE_TAGS.length : index;
}

export function sourceOrder(source: Source): number {
  const index = SOURCES.indexOf(source);
  return index === -1 ? SOURCES.length : index;
}
