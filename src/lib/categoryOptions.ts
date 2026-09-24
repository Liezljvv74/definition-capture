import { foldName } from "@/lib/foldName";
import type { Sorting } from "@/lib/sortName";

/**
 * The categories a list's filter should offer.
 *
 * Only the ones actually in use, so choosing one always shows something. The
 * two list pages had drifted on this: the vocabulary page built the dropdown
 * from the saved rows, while the phrase page started from the standing list in
 * Settings and added the in-use names to it. On a fresh account that meant
 * Phrases offered all eight default categories and every one of them led to
 * the no-matches screen, while Vocabulary sensibly showed no dropdown at all.
 *
 * Which is right depends on what the control is for, and this one filters
 * rather than files. The form is where the standing list belongs, because
 * that is where a category is chosen for the first time and has to exist
 * before anything carries it. A filter offering a group nothing is in is only
 * ever a dead end.
 *
 * `selected` is kept in the list even when nothing carries it any more, so
 * emptying the last row out of the filtered group leaves the dropdown showing
 * the name it is still filtering by rather than a blank.
 *
 * Names are folded to compare and kept as written to display, so a category
 * saved as "Food" and another as "food" are one option, spelled the way it
 * was first met.
 *
 * `compareText` is passed in rather than imported because the order is the
 * account's, set by the language chosen in Settings.
 */
export function categoryOptions(
  items: readonly { categories: string[] }[],
  selected: string,
  compareText: Sorting["compareText"],
): string[] {
  const byKey = new Map<string, string>();

  for (const item of items) {
    for (const name of item.categories) {
      const key = foldName(name);
      if (!byKey.has(key)) byKey.set(key, name);
    }
  }

  if (selected && !byKey.has(foldName(selected))) {
    byKey.set(foldName(selected), selected);
  }

  return [...byKey.values()].sort(compareText);
}
