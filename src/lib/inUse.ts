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
 * Why a collection or source cannot be removed from Settings, or undefined
 * when it can. The database refuses to delete one that words or phrases still
 * use, so the button says so first rather than letting the click fail.
 */
export function inUseReason(counts: Map<string, number>, name: string): string | undefined {
  const count = counts.get(foldName(name)) ?? 0;
  if (count === 0) return undefined;
  const items = count === 1 ? "1 word or phrase uses it" : `${count} words and phrases use it`;
  return `${items}. Rename it to change it, or to merge it into another.`;
}
