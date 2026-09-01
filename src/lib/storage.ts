/**
 * The only module in the app that talks to the browser's persistence layer.
 *
 * Mechanism: `localStorage`. The glossary is a small, single-user, plain-text
 * list that has to survive a full page reload with no server involved, and
 * localStorage gives us exactly that with synchronous reads and zero setup.
 *
 * Everything is funnelled through the functions below, so swapping in IndexedDB
 * (or a real API) later means rewriting this file only — no component changes.
 */

import {
  DEFAULT_MODULE_TAG,
  DEFAULT_SOURCE,
  type ModuleTag,
  type Source,
} from "@/lib/constants";
import {
  isModuleTag,
  isSource,
  needsDefinition,
  type Entry,
  type EntryInput,
} from "@/lib/types";

const STORAGE_KEY = "definition-capture.entries.v1";

export type GlossarySnapshot = {
  entries: Entry[];
  /** False until the browser store has actually been read (server render, first paint). */
  loaded: boolean;
};

const EMPTY_SNAPSHOT: GlossarySnapshot = { entries: [], loaded: false };

let snapshot: GlossarySnapshot = EMPTY_SNAPSHOT;
const listeners = new Set<() => void>();

/* ------------------------------------------------------------------ reading */

/**
 * Turns unknown JSON into an Entry, or null if it is unusable.
 * `allowMissingId` is for imported backups, where a hand-written or older file
 * may have no id yet — the caller assigns one.
 */
function parseEntry(raw: unknown, allowMissingId = false): Entry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;

  const rawId = typeof value.id === "string" ? value.id.trim() : "";
  const id = rawId || (allowMissingId ? "" : null);
  const term = typeof value.term === "string" && value.term.trim() ? value.term.trim() : null;
  if (id === null || !term) return null;

  const definition = typeof value.definition === "string" ? value.definition : "";
  const dateAdded =
    typeof value.dateAdded === "string" ? value.dateAdded : new Date().toISOString();

  return {
    id,
    term,
    definition,
    moduleTag: isModuleTag(value.moduleTag) ? value.moduleTag : DEFAULT_MODULE_TAG,
    source: isSource(value.source) ? value.source : DEFAULT_SOURCE,
    dateAdded,
    dateUpdated: typeof value.dateUpdated === "string" ? value.dateUpdated : null,
    needsDefinition: needsDefinition(definition),
  };
}

function readFromStorage(): Entry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => parseEntry(item))
      .filter((entry): entry is Entry => entry !== null);
  } catch {
    // Corrupt or unavailable storage (private mode, quota, hand-edited JSON):
    // start from an empty glossary rather than crashing the page.
    return [];
  }
}

function writeToStorage(entries: Entry[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Nothing useful to do if the write fails; the in-memory list stays correct
    // for this session.
  }
}

/* --------------------------------------------------- external store plumbing */

function setSnapshot(entries: Entry[]): void {
  snapshot = { entries, loaded: true };
  for (const listener of listeners) listener();
}

function commit(entries: Entry[]): void {
  writeToStorage(entries);
  setSnapshot(entries);
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // Keep two open tabs of the app in step with each other.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    setSnapshot(readFromStorage());
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getSnapshot(): GlossarySnapshot {
  if (typeof window === "undefined") return EMPTY_SNAPSHOT;
  if (!snapshot.loaded) snapshot = { entries: readFromStorage(), loaded: true };
  return snapshot;
}

export function getServerSnapshot(): GlossarySnapshot {
  return EMPTY_SNAPSHOT;
}

/* --------------------------------------------------------------- mutations  */

function createId(taken: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const id = Math.random().toString(36).slice(2, 8);
    if (!taken.has(id)) return id;
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function clean(input: EntryInput) {
  const definition = input.definition.trim();
  return {
    term: input.term.trim(),
    definition,
    moduleTag: input.moduleTag,
    source: input.source,
    needsDefinition: needsDefinition(definition),
  };
}

export function createEntry(input: EntryInput): Entry {
  const entries = getSnapshot().entries;
  const entry: Entry = {
    id: createId(new Set(entries.map((existing) => existing.id))),
    ...clean(input),
    dateAdded: new Date().toISOString(),
    dateUpdated: null,
  };
  commit([entry, ...entries]);
  return entry;
}

/** Updates in place. `dateAdded` deliberately keeps its original value. */
export function updateEntry(id: string, input: EntryInput): Entry | null {
  const entries = getSnapshot().entries;
  const existing = entries.find((entry) => entry.id === id);
  if (!existing) return null;

  const updated: Entry = {
    ...existing,
    ...clean(input),
    dateUpdated: new Date().toISOString(),
  };
  commit(entries.map((entry) => (entry.id === id ? updated : entry)));
  return updated;
}

export function deleteEntry(id: string): void {
  const entries = getSnapshot().entries;
  if (!entries.some((entry) => entry.id === id)) return;
  commit(entries.filter((entry) => entry.id !== id));
}

/* ----------------------------------------------------------------- queries  */

export function getEntry(id: string): Entry | undefined {
  return getSnapshot().entries.find((entry) => entry.id === id);
}

/** Case-insensitive term lookup, used for the duplicate check before saving. */
export function findByTerm(term: string, ignoreId?: string): Entry | undefined {
  const needle = term.trim().toLocaleLowerCase();
  if (!needle) return undefined;
  return getSnapshot().entries.find(
    (entry) => entry.id !== ignoreId && entry.term.toLocaleLowerCase() === needle,
  );
}

/* ------------------------------------------------------- backup and restore */

export const BACKUP_FORMAT = "definition-capture-backup";
export const BACKUP_VERSION = 1;

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  entries: Entry[];
};

/** Snapshot of the whole glossary, ready to be written to a file. */
export function buildBackup(): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    entries: getSnapshot().entries,
  };
}

export type BackupParse =
  | { ok: true; entries: Entry[]; unreadable: number }
  | { ok: false; error: string };

function readEntryList(raw: unknown): unknown[] | null {
  // Accept both a full backup file and a bare array of entries.
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object" && raw !== null) {
    const { entries } = raw as { entries?: unknown };
    if (Array.isArray(entries)) return entries;
  }
  return null;
}

export function parseBackup(text: string): BackupParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON, so it cannot be read." };
  }

  const list = readEntryList(raw);
  if (!list) {
    return {
      ok: false,
      error:
        "That file does not look like a Definition Capture backup — it has no list of entries.",
    };
  }

  const entries = list
    .map((item) => parseEntry(item, true))
    .filter((entry): entry is Entry => entry !== null);

  if (entries.length === 0) {
    return { ok: false, error: "That backup contains no readable terms." };
  }

  return { ok: true, entries, unreadable: list.length - entries.length };
}

export type ImportMode =
  /** Add terms that are new; leave existing ones untouched. */
  | "skip"
  /** Add new terms and overwrite existing ones from the backup. */
  | "update"
  /** Throw away the current glossary and restore the backup wholesale. */
  | "replace";

export type ImportResult = { added: number; updated: number; skipped: number };

function newestFirst(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => b.dateAdded.localeCompare(a.dateAdded));
}

/**
 * Merges a parsed backup into the glossary. Existing entries are matched by
 * term, case-insensitively — the same rule the add form uses. Imported entries
 * keep their original `dateAdded`, which is the point of a backup.
 */
export function importEntries(incoming: Entry[], mode: ImportMode): ImportResult {
  const result: ImportResult = { added: 0, updated: 0, skipped: 0 };

  if (mode === "replace") {
    const taken = new Set<string>();
    const restored = incoming.map((entry) => {
      const id = entry.id && !taken.has(entry.id) ? entry.id : createId(taken);
      taken.add(id);
      return { ...entry, id };
    });
    result.added = restored.length;
    commit(newestFirst(restored));
    return result;
  }

  const next = [...getSnapshot().entries];
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
      const existing = next[existingIndex];
      next[existingIndex] = {
        ...existing,
        term: candidate.term,
        definition: candidate.definition,
        moduleTag: candidate.moduleTag,
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

  if (result.added > 0 || result.updated > 0) commit(newestFirst(next));
  return result;
}

export type { ModuleTag, Source };
