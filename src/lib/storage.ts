/**
 * The word store. All reads and writes go through `remoteStore`, so no
 * component ever talks to Supabase directly.
 *
 * Every function below keeps the signature it had when this was a localStorage
 * store — `createEntry` still hands back the finished `Entry` there and then.
 * That is what let the switch to a database stay inside this file and
 * `remoteStore.ts`: the forms and dialogs never learned that saving became a
 * network call. See `remoteStore.ts` for how an optimistic write reports a
 * failure it can no longer block on.
 */

import { foldName } from "@/lib/foldName";
import { planImport } from "@/lib/planImport";
import { createId, createRemoteStore } from "@/lib/remoteStore";
import type { Source } from "@/lib/constants";
import {
  needsDefinition,
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
  // `word` is the current spelling and `term` is what every backup written
  // before version 6 used. Both are read, so a file already on disk imports.
  const word = readString(value.word ?? value.term).trim() || null;
  if (id === null || !word) return null;

  const definition = readString(value.definition);

  return {
    id,
    word,
    definition,
    ref: readString(value.ref),
    categories: readCategories(value.categories),
    source: readSource(value.source),
    dateAdded: readString(value.dateAdded) || new Date().toISOString(),
    dateUpdated: typeof value.dateUpdated === "string" ? value.dateUpdated : null,
    needsDefinition: needsDefinition(definition),
  };
}

/**
 * A word as a backup file spells it.
 *
 * Declared rather than inferred, and this is the point of the type: until it
 * existed, `buildBackup` handed `Entry` objects straight to `JSON.stringify`,
 * so the file's format was whatever the domain type happened to be that week.
 * Renaming `Entry.term` to `Entry.word` silently changed every future export
 * and the reader had to be patched by hand afterwards to keep old files
 * working. With the shape written down, a domain rename is a compile error
 * here and a decision rather than an accident.
 *
 * `needsDefinition` is deliberately absent. It is derived from `definition`
 * and `parseEntry` recomputes it on the way back in, never trusting the file,
 * so writing it only made every backup larger and invited someone to believe
 * it.
 */
export type WireWord = {
  id: string;
  word: string;
  definition: string;
  ref: string;
  categories: string[];
  source: Source;
  dateAdded: string;
  dateUpdated: string | null;
};

/** The counterpart to `parseEntry`: one word on its way into a file. */
export function toWireWord(entry: Entry): WireWord {
  return {
    id: entry.id,
    word: entry.word,
    definition: entry.definition,
    ref: entry.ref,
    categories: entry.categories,
    source: entry.source,
    dateAdded: entry.dateAdded,
    dateUpdated: entry.dateUpdated,
  };
}

const store = createRemoteStore<Entry>({
  table: "words",
  orderBy: "date_added",
  idOf: (entry) => entry.id,
  nameOf: (entry) => entry.word,

  fromRow(row) {
    const id = readString(row.id);
    const word = readString(row.word).trim();
    if (!id || !word) return null;

    const definition = readString(row.definition);
    return {
      id,
      word,
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
    word: entry.word,
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
export const subscribeToError = store.subscribeToError;
export const getError = store.getError;
export const settled = store.settled;

/* --------------------------------------------------------------- mutations */

function clean(input: EntryInput) {
  const definition = input.definition.trim();
  return {
    word: input.word.trim(),
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

/**
 * Removes every entry whose id is listed, in one write — so a bulk delete is a
 * single round trip and a single re-render, not one per row. Returns how many
 * were actually removed; ids that are not in the word list are ignored.
 */
export const deleteEntries = store.removeMany;

/* ----------------------------------------------------------------- queries */

export function getEntries(): Entry[] {
  return store.items();
}

/** Case-insensitive word lookup, used for the duplicate check before saving. */
export const findByWord = store.findByName;

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
 * Merges imported entries into the word list. Existing entries are matched by
 * word, case- and accent-insensitively — the same rule the add form uses.
 * Imported entries keep their original `dateAdded`, which is the point of a
 * backup.
 *
 * What it *means* to merge lives in `planImport`, which is pure and tested;
 * this decides what that plan is worth writing and how.
 */
export function importEntries(incoming: Entry[], mode: ImportMode): ImportCounts {
  const now = new Date().toISOString();

  const plan = planImport(store.items(), incoming, mode, {
    keyOf: (entry) => foldName(entry.word),
    idOf: (entry) => entry.id,
    withId: (entry, id) => ({ ...entry, id }),
    merge: (existing, candidate) => ({
      ...existing,
      word: candidate.word,
      definition: candidate.definition,
      ref: candidate.ref,
      // Categories are part of the entry the backup is restoring. Leaving
      // them out kept whatever was already there and silently threw the
      // backup’s away, which is not what "update" promises.
      categories: candidate.categories,
      source: candidate.source,
      needsDefinition: candidate.needsDefinition,
      dateUpdated: now,
    }),
  });

  if (plan.toReplace) {
    store.replaceAll(newestFirst(plan.toReplace));
    return plan.counts;
  }

  // Two writes for the whole import, whatever its size: one for the rows that
  // already existed and one for the rows that did not.
  store.updateMany(plan.toUpdate);
  store.insertMany(newestFirst(plan.toInsert));
  return plan.counts;
}
