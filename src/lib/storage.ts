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

function parseEntry(raw: unknown): Entry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;

  const id = typeof value.id === "string" ? value.id : null;
  const term = typeof value.term === "string" ? value.term : null;
  if (!id || !term) return null;

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
    return parsed.map(parseEntry).filter((entry): entry is Entry => entry !== null);
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

function createId(existing: Entry[]): string {
  const taken = new Set(existing.map((entry) => entry.id));
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
    id: createId(entries),
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

export type { ModuleTag, Source };
