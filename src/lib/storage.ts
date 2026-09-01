/**
 * The glossary store. All reads and writes go through `browserStore`, so no
 * component ever touches `localStorage` directly.
 */

import {
  createBrowserStore,
  createId,
  NO_IMPORT,
  type ImportCounts,
  type ImportMode,
} from "@/lib/browserStore";
import { DEFAULT_SOURCE } from "@/lib/constants";
import {
  isSource,
  needsDefinition,
  readString,
  type Entry,
  type EntryInput,
} from "@/lib/types";

const STORAGE_KEY = "definition-capture.entries.v1";

/**
 * Turns unknown JSON into an Entry, or null if it is unusable.
 * `allowMissingId` is for imported backups, where a hand-written or older file
 * may have no id yet — the caller assigns one.
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
    source: isSource(value.source) ? value.source : DEFAULT_SOURCE,
    dateAdded: readString(value.dateAdded) || new Date().toISOString(),
    dateUpdated: typeof value.dateUpdated === "string" ? value.dateUpdated : null,
    needsDefinition: needsDefinition(definition),
  };
}

const store = createBrowserStore<Entry>(STORAGE_KEY, (raw) => parseEntry(raw));

export const subscribe = store.subscribe;
export const getSnapshot = store.getSnapshot;
export const getServerSnapshot = store.getServerSnapshot;

/* --------------------------------------------------------------- mutations */

function clean(input: EntryInput) {
  const definition = input.definition.trim();
  return {
    term: input.term.trim(),
    definition,
    ref: input.ref.trim(),
    source: input.source,
    needsDefinition: needsDefinition(definition),
  };
}

export function createEntry(input: EntryInput): Entry {
  const entries = store.items();
  const entry: Entry = {
    id: createId(new Set(entries.map((existing) => existing.id))),
    ...clean(input),
    dateAdded: new Date().toISOString(),
    dateUpdated: null,
  };
  store.commit([entry, ...entries]);
  return entry;
}

/** Updates in place. `dateAdded` deliberately keeps its original value. */
export function updateEntry(id: string, input: EntryInput): Entry | null {
  const entries = store.items();
  const existing = entries.find((entry) => entry.id === id);
  if (!existing) return null;

  const updated: Entry = {
    ...existing,
    ...clean(input),
    dateUpdated: new Date().toISOString(),
  };
  store.commit(entries.map((entry) => (entry.id === id ? updated : entry)));
  return updated;
}

export function deleteEntry(id: string): void {
  const entries = store.items();
  if (!entries.some((entry) => entry.id === id)) return;
  store.commit(entries.filter((entry) => entry.id !== id));
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
 * Merges imported entries into the glossary. Existing entries are matched by
 * term, case-insensitively — the same rule the add form uses. Imported entries
 * keep their original `dateAdded`, which is the point of a backup.
 */
export function importEntries(incoming: Entry[], mode: ImportMode): ImportCounts {
  const result: ImportCounts = { ...NO_IMPORT };

  if (mode === "replace") {
    const taken = new Set<string>();
    const restored = incoming.map((entry) => {
      const id = entry.id && !taken.has(entry.id) ? entry.id : createId(taken);
      taken.add(id);
      return { ...entry, id };
    });
    result.added = restored.length;
    store.commit(newestFirst(restored));
    return result;
  }

  const next = [...store.items()];
  const indexByTerm = new Map(
    next.map((entry, index) => [entry.term.toLocaleLowerCase(), index]),
  );
  const taken = new Set(next.map((entry) => entry.id));
  const now = new Date().toISOString();

  for (const candidate of incoming) {
    const key = candidate.term.toLocaleLowerCase();
    const existingIndex = indexByTerm.get(key);

    if (existingIndex !== undefined) {
      if (mode === "skip") {
        result.skipped += 1;
        continue;
      }
      next[existingIndex] = {
        ...next[existingIndex],
        term: candidate.term,
        definition: candidate.definition,
        ref: candidate.ref,
        source: candidate.source,
        needsDefinition: candidate.needsDefinition,
        dateUpdated: now,
      };
      result.updated += 1;
      continue;
    }

    const id = candidate.id && !taken.has(candidate.id) ? candidate.id : createId(taken);
    taken.add(id);
    next.push({ ...candidate, id });
    indexByTerm.set(key, next.length - 1);
    result.added += 1;
  }

  if (result.added > 0 || result.updated > 0) store.commit(newestFirst(next));
  return result;
}
