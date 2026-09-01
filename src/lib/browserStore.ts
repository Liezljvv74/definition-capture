/**
 * The persistence plumbing shared by the glossary and the phrase list.
 *
 * Mechanism: `localStorage`. Each list is a small, single-user, plain-text
 * collection that has to survive a full page reload with no server involved,
 * and localStorage gives exactly that with synchronous reads and zero setup.
 *
 * Both stores are built from this one factory, so swapping in IndexedDB (or a
 * real API) later means rewriting this file only — and the two lists cannot
 * quietly drift apart in how they load, save, or sync between tabs.
 */

export type StoreSnapshot<T> = {
  items: T[];
  /** False until the browser store has actually been read (server render, first paint). */
  loaded: boolean;
};

export type BrowserStore<T> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => StoreSnapshot<T>;
  getServerSnapshot: () => StoreSnapshot<T>;
  /** The current items, reading the browser store on first use. */
  items: () => T[];
  /** Persist and notify every subscriber. */
  commit: (items: T[]) => void;
};

export function createBrowserStore<T>(
  storageKey: string,
  parseItem: (raw: unknown) => T | null,
): BrowserStore<T> {
  const empty: StoreSnapshot<T> = { items: [], loaded: false };
  let snapshot: StoreSnapshot<T> = empty;
  const listeners = new Set<() => void>();

  function read(): T[] {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => parseItem(item))
        .filter((item): item is T => item !== null);
    } catch {
      // Corrupt or unavailable storage (private mode, quota, hand-edited JSON):
      // start from an empty list rather than crashing the page.
      return [];
    }
  }

  function write(items: T[]): void {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      // Nothing useful to do if the write fails; the in-memory list stays
      // correct for this session.
    }
  }

  function publish(items: T[]): void {
    snapshot = { items, loaded: true };
    for (const listener of listeners) listener();
  }

  function getSnapshot(): StoreSnapshot<T> {
    if (typeof window === "undefined") return empty;
    if (!snapshot.loaded) snapshot = { items: read(), loaded: true };
    return snapshot;
  }

  return {
    subscribe(listener) {
      listeners.add(listener);

      // Keep two open tabs of the app in step with each other.
      const onStorage = (event: StorageEvent) => {
        if (event.key !== null && event.key !== storageKey) return;
        publish(read());
      };
      window.addEventListener("storage", onStorage);

      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
    getSnapshot,
    getServerSnapshot: () => empty,
    items: () => getSnapshot().items,
    commit(items) {
      write(items);
      publish(items);
    },
  };
}

/** Short, URL-friendly id that avoids anything already taken. */
export function createId(taken: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const id = Math.random().toString(36).slice(2, 8);
    if (!taken.has(id)) return id;
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** How an imported list should meet the list already saved. */
export type ImportMode =
  /** Add items that are new; leave existing ones untouched. */
  | "skip"
  /** Add new items and overwrite matching ones from the backup. */
  | "update"
  /** Throw away what is saved and restore the backup wholesale. */
  | "replace";

export type ImportCounts = { added: number; updated: number; skipped: number };

export const NO_IMPORT: ImportCounts = { added: 0, updated: 0, skipped: 0 };
