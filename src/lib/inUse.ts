import { foldName } from "@/lib/foldName";

/**
 * How many items use each name, keyed by the folded name so it matches the
 * way every name in the app is matched. Each inner list is one item's names
 * (its collections, or its one source), and an item counts once per name
 * however it spells it.
 */
export function countUses(namesPerItem: readonly (readonly string[])[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const names of namesPerItem) {
    for (const key of new Set(names.filter((name) => name.trim() !== "").map(foldName))) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Why a collection, source or topic cannot be removed from Settings, or
 * undefined when it can. The database refuses to delete one that something
 * still uses, so the button says so first rather than letting the click
 * fail. `noun` and `nounPlural` name what is doing the using, since a topic
 * is used by rules rather than by words and phrases; the defaults are the
 * two that fit the older callers, so their text is unchanged.
 */
export function inUseReason(
  counts: Map<string, number>,
  name: string,
  noun = "word or phrase",
  nounPlural = "words and phrases",
): string | undefined {
  const count = counts.get(foldName(name)) ?? 0;
  if (count === 0) return undefined;
  const items = count === 1 ? `1 ${noun} uses it` : `${count} ${nounPlural} use it`;
  return `${items}. Rename it to change it, or to merge it into another.`;
}
