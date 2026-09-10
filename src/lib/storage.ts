/**
 * The term store. All reads and writes go through `remoteStore`, so no
 * component ever talks to Supabase directly.
 *
 * Every function below keeps the signature it had when this was a localStorage
 * store — `createEntry` still hands back the finished `Entry` there and then.
 * That is what let the switch to a database stay inside this file and
 * `remoteStore.ts`: the forms and dialogs never learned that saving became a
 * network call. See `remoteStore.ts` for how an optimistic write reports a
 * failure it can no longer block on.
 */

import { createId, createRemoteStore } from "@/lib/remoteStore";
import {
  needsDefinition,
  NO_IMPORT,
  readCategories,
  readSource,
  readString,
  type Entry,
  type EntryInput,
  type ImportCounts,
  type ImportMode,
} from "@/lib/types";

/**
 * Turns unknown JSON into an Entry, or null if it is unusable.
 * `allowMissingId` is for imported backups, where a hand-written or older file
 * may have no id yet — the caller assigns one.
 *
 * This reads the camelCase shape a backup file uses. Database rows arrive in
 * snake_case and go through `fromRow` instead.
 */
export function parseEntry(raw: unknown, allowMissingId = false): Entry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;

  const rawId = readString(value.id).trim();
  const id = rawId || (allowMissingId ? "" : null);
  const term = readString(value.term).trim() || null;
  if (id === null || !term) return null;

  const definition = readString(value.definition);

  return {
    id,
    term,
    definition,
    ref: readString(value.ref),
    categories: readCategories(value.categories),
    source: readSource(value.source),
    dateAdded: readString(value.dateAdded) || new Date().toISOString(),
    dateUpdated: typeof value.dateUpdated === "string" ? value.dateUpdated : null,
    needsDefinition: needsDefinition(definition),
  };
}

const store = createRemoteStore<Entry>({
  table: "terms",
  orderBy: "date_added",
  idOf: (entry) => entry.id,

  fromRow(row) {
    const id = readString(row.id);
    const term = readString(row.term).trim();
    if (!id || !term) return null;

    const definition = readString(row.definition);
    return {
      id,
      term,
      definition,
      ref: readString(row.ref),
      categories: readCategories(row.categories),
      source: readSource(row.source),
      dateAdded: readString(row.date_added),
      dateUpdated: typeof row.date_updated === "string" ? row.date_updated : null,
      // Never trusted from storage — recomputed from the text, same as before.
      needsDefinition: needsDefinition(definition),
    };
  },

  toRow: (entry) => ({
    id: entry.id,
    term: entry.term,
    definition: entry.definition,
    ref: entry.ref,
    categories: entry.categories,
    source: entry.source,
    date_added: entry.dateAdded,
    date_updated: entry.dateUpdated,
  }),
});

export const subscribe = store.subscribe;
export const getSnapshot = store.getSnapshot;
export const getServerSnapshot = store.getServerSnapshot;
export const clearError = store.clearError;

/* --------------------------------------------------------------- mutations */

function clean(input: EntryInput) {
  const definition = input.definition.trim();
  return {
    term: input.term.trim(),
    definition,
    ref: input.ref.trim(),
    // Trimmed, de-duplicated and capped here as well as in the form, so a
    // value arriving from an import obeys the same rule as a typed one.
    categories: readCategories(input.categories),
    source: input.source,
    needsDefinition: needsDefinition(definition),
  };
}

export function createEntry(input: EntryInput): Entry {
  const entry: Entry = {
    id: createId(),
    ...clean(input),
    dateAdded: new Date().toISOString(),
    dateUpdated: null,
  };
  store.insert(entry);
  return entry;
}

/** Updates in place. `dateAdded` deliberately keeps its original value. */
export function updateEntry(id: string, input: EntryInput): Entry | null {
  const existing = store.items().find((entry) => entry.id === id);
  if (!existing) return null;

  const updated: Entry = {
    ...existing,
    ...clean(input),
    dateUpdated: new Date().toISOString(),
  };
  store.update(updated);
  return updated;
}

export function deleteEntry(id: string): void {
  deleteEntries([id]);
}

/**
 * Removes every entry whose id is listed, in one write — so a bulk delete is a
 * single round trip and a single re-render, not one per row. Returns how many
 * were actually removed; ids that are not in the term list are ignored.
 */
export function deleteEntries(ids: readonly string[]): number {
  const present = new Set(store.items().map((entry) => entry.id));
  const doomed = [...new Set(ids)].filter((id) => present.has(id));
  if (doomed.length === 0) return 0;

  store.remove(doomed);
  return doomed.length;
}

/* ----------------------------------------------------------------- queries */

export function getEntries(): Entry[] {
  return store.items();
}

/** Case-insensitive term lookup, used for the duplicate check before saving. */
export function findByTerm(term: string, ignoreId?: string): Entry | undefined {
  const needle = term.trim().toLocaleLowerCase();
  if (!needle) return undefined;
  return store
    .items()
    .find((entry) => entry.id !== ignoreId && entry.term.toLocaleLowerCase() === needle);
}

/* ------------------------------------------------------------------ import */

export function parseEntryList(list: unknown[]): { entries: Entry[]; unreadable: number } {
  const entries = list
    .map((item) => parseEntry(item, true))
    .filter((entry): entry is Entry => entry !== null);
  return { entries, unreadable: list.length - entries.length };
}

function newestFirst(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => b.dateAdded.localeCompare(a.dateAdded));
}

/**
 * Ids in a backup are whatever the exporting version used — the localStorage
 * store minted short random strings, which the `uuid` primary key will not
 * accept. Anything that is not a usable id is replaced with a fresh one.
 */
function usableId(id: string, taken: Set<string>): string {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  return isUuid && !taken.has(id) ? id : createId();
}

/**
 * Merges imported entries into the term list. Existing entries are matched by
 * term, case-insensitively — the same rule the add form uses. Imported entries
 * keep their original `dateAdded`, which is the point of a backup.
 */
export function importEntries(incoming: Entry[], mode: ImportMode): ImportCounts {
  const result: ImportCounts = { ...NO_IMPORT };

  if (mode === "replace") {
    const taken = new Set<string>();
    const restored = incoming.map((entry) => {
      const id = usableId(entry.id, taken);
      taken.add(id);
      return { ...entry, id };
    });
    result.added = restored.length;
    store.replaceAll(newestFirst(restored));
    return result;
  }

  const byTerm = new Map(
    store.items().map((entry) => [entry.term.toLocaleLowerCase(), entry]),
  );
  const taken = new Set(store.items().map((entry) => entry.id));
  const now = new Date().toISOString();
  const added: Entry[] = [];

  for (const candidate of incoming) {
    const existing = byTerm.get(candidate.term.toLocaleLowerCase());

    if (existing) {
      if (mode === "skip") {
        result.skipped += 1;
        continue;
      }
      store.update({
        ...existing,
        term: candidate.term,
        definition: candidate.definition,
        ref: candidate.ref,
        // Categories are part of the entry the backup is restoring. Leaving
        // them out kept whatever was already there and silently threw the
        // backup’s away, which is not what "update" promises.
        categories: candidate.categories,
        source: candidate.source,
        needsDefinition: candidate.needsDefinition,
        dateUpdated: now,
      });
      result.updated += 1;
      continue;
    }

    const id = usableId(candidate.id, taken);
    taken.add(id);
    const entry = { ...candidate, id };
    added.push(entry);
    byTerm.set(candidate.term.toLocaleLowerCase(), entry);
    result.added += 1;
  }

  // Every new entry in one insert; the updates above each went on their own,
  // because they touch rows that already exist.
  store.insertMany(newestFirst(added));
  return result;
}
