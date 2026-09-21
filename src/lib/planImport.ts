import { usableId } from "@/lib/remoteStore";
import { NO_IMPORT, type ImportCounts, type ImportMode } from "@/lib/types";

/**
 * What an import would do, worked out before anything is written.
 *
 * `toReplace` is set for Replace mode and null otherwise; the other two are
 * the merge modes' halves. Exactly one of the two shapes is populated.
 */
export type ImportPlan<T> = {
  counts: ImportCounts;
  /** Rows that already exist and are being overwritten. */
  toUpdate: T[];
  /** Rows that are new to this account. */
  toInsert: T[];
  /** The whole list, for Replace. Null in the merge modes. */
  toReplace: T[] | null;
};

export type ImportRules<T> = {
  /** The folded name two rows are "the same" by — see `foldName`. */
  keyOf: (item: T) => string;
  idOf: (item: T) => string;
  /** The item with a different id. */
  withId: (item: T, id: string) => T;
  /** What an existing row becomes when the file overwrites it. */
  merge: (existing: T, candidate: T) => T;
};

/**
 * Decides what an import means, without performing it.
 *
 * This is pure on purpose. The three stores each ran this logic inline,
 * wrapped around calls to a module-scope store, which made it reachable only
 * through a live Supabase session — and under test every one of those writes
 * is a silent no-op, so the functions would have reported counts for writes
 * that never happened. That is exactly the blind spot the duplicate-word bug
 * lived in: a second copy of a word in one file matched a row that had not
 * been inserted yet, so the update patched nothing, and the count said one.
 *
 * Two rules carry that history and are the reason this is worth testing:
 *
 *  - A name introduced by the file itself is tracked by position in
 *    `toInsert`, so a later copy merges into the pending row rather than
 *    being addressed as a row that already exists.
 *  - Replace de-duplicates before anything is written, because `replaceAll`
 *    deletes the old list before inserting the new one — a duplicate name
 *    would be refused by the unique index after the delete had happened,
 *    leaving the list empty.
 */
export function planImport<T>(
  existing: readonly T[],
  incoming: readonly T[],
  mode: ImportMode,
  rules: ImportRules<T>,
): ImportPlan<T> {
  const counts: ImportCounts = { ...NO_IMPORT };
  const { keyOf, idOf, withId, merge } = rules;

  if (mode === "replace") {
    const byKey = new Map<string, T>();
    // Last copy wins, matching what the merge modes do when a file repeats a
    // name.
    for (const item of incoming) byKey.set(keyOf(item), item);

    const taken = new Set<string>();
    const toReplace = [...byKey.values()].map((item) => {
      const id = usableId(idOf(item), taken);
      taken.add(id);
      return withId(item, id);
    });

    counts.added = toReplace.length;
    return { counts, toUpdate: [], toInsert: [], toReplace };
  }

  const byKey = new Map(existing.map((item) => [keyOf(item), item]));
  const taken = new Set(existing.map(idOf));
  const toUpdate: T[] = [];
  const toInsert: T[] = [];
  /** Where in `toInsert` a name this same file introduced is waiting. */
  const pending = new Map<string, number>();

  for (const candidate of incoming) {
    const key = keyOf(candidate);
    const match = byKey.get(key);

    if (match) {
      if (mode === "skip") {
        counts.skipped += 1;
        continue;
      }

      const merged = merge(match, candidate);
      const at = pending.get(key);
      if (at === undefined) toUpdate.push(merged);
      else toInsert[at] = merged;

      // So a third copy of the same name merges onto the second, not the first.
      byKey.set(key, merged);
      counts.updated += 1;
      continue;
    }

    const id = usableId(idOf(candidate), taken);
    taken.add(id);
    const fresh = withId(candidate, id);
    pending.set(key, toInsert.length);
    toInsert.push(fresh);
    byKey.set(key, fresh);
    counts.added += 1;
  }

  return { counts, toUpdate, toInsert, toReplace: null };
}
