/**
 * The persistence plumbing for a Supabase-backed list — the replacement for
 * `createBrowserStore`, which said in its own header that swapping in a real
 * API should mean rewriting one file. This is that file.
 *
 * Two things are preserved from the localStorage design, because the whole app
 * is built on them:
 *
 *  1. Reads are synchronous. The full list for one signed-in reader is small
 *     enough to hold in memory, so it is fetched once and every component keeps
 *     reading it through `useSyncExternalStore`.
 *  2. Writes look synchronous. A mutation updates the cache and notifies
 *     subscribers immediately, then sends the row to Supabase in the
 *     background. The screen never waits on the network.
 *
 * The cost of (2) is that a write can fail after the UI has already moved on.
 * When that happens the store reloads from the database — so what is on screen
 * is what is really stored — and puts a message in `error` for the banner to
 * show. Losing a write silently would be worse than an ugly banner.
 */

import { currentUserId, subscribe as subscribeToSession } from "@/lib/session";
import { getSupabase } from "@/lib/supabaseClient";

export type StoreSnapshot<T> = {
  items: T[];
  /** False until the first fetch has come back. */
  loaded: boolean;
  /** Set when a write failed and the list was reloaded to match the database. */
  error: string | null;
};

export type RemoteStore<T> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => StoreSnapshot<T>;
  getServerSnapshot: () => StoreSnapshot<T>;
  /** The cached items. Empty until the first fetch resolves. */
  items: () => T[];
  /** Add one item to the front of the list. */
  insert: (item: T) => void;
  /** Replace one item in place, matched by id. */
  update: (item: T) => void;
  /** Remove every listed id in one write. */
  remove: (ids: readonly string[]) => void;
  /** Throw the whole list away and store these instead — a backup restore. */
  replaceAll: (items: T[]) => void;
  /** Store many new items in one write — the localStorage import. */
  insertMany: (items: T[]) => void;
  /** Clear the error banner. */
  clearError: () => void;
};

type Row = Record<string, unknown>;

export type RemoteStoreConfig<T> = {
  table: string;
  /** Column the list is sorted by, newest first. */
  orderBy: string;
  /** Turns a database row into an app object. */
  fromRow: (row: Row) => T | null;
  /** Turns an app object into a database row, minus `user_id`. */
  toRow: (item: T) => Row;
  /** Reads the id off an app object. */
  idOf: (item: T) => string;
};

export function createRemoteStore<T>(config: RemoteStoreConfig<T>): RemoteStore<T> {
  const empty: StoreSnapshot<T> = { items: [], loaded: false, error: null };
  let snapshot: StoreSnapshot<T> = empty;
  const listeners = new Set<() => void>();
  let started = false;
  /** The user the cache belongs to, so a sign-out or account switch clears it. */
  let cachedFor: string | null = null;

  function publish(next: StoreSnapshot<T>): void {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function setItems(items: T[]): void {
    publish({ items, loaded: true, error: snapshot.error });
  }

  function setError(message: string): void {
    publish({ items: snapshot.items, loaded: snapshot.loaded, error: message });
  }

  async function load(userId: string): Promise<void> {
    const supabase = getSupabase();
    if (!supabase) return;

    const { data, error } = await supabase
      .from(config.table)
      .select("*")
      .order(config.orderBy, { ascending: false });

    // A sign-out or account switch while the request was in flight: the rows
    // that just arrived belong to the wrong reader, so drop them.
    if (currentUserId() !== userId) return;

    if (error) {
      publish({ items: [], loaded: true, error: readError(error) });
      return;
    }

    const items = (data ?? [])
      .map((row) => config.fromRow(row as Row))
      .filter((item): item is T => item !== null);
    publish({ items, loaded: true, error: null });
  }

  /** Re-reads the list after a failed write, so the screen matches the database. */
  function reload(): void {
    const userId = currentUserId();
    if (userId) void load(userId);
  }

  function syncToSession(): void {
    const userId = currentUserId();
    if (userId === cachedFor) return;
    cachedFor = userId;

    if (!userId) {
      // Signed out. Drop the cache so the next reader never sees these rows,
      // and go back to "not loaded" so the list shows its loading state.
      publish(empty);
      return;
    }
    publish({ items: [], loaded: false, error: null });
    void load(userId);
  }

  /**
   * Optimistic write: the cache is already updated by the caller, so this only
   * has to report a failure and put the truth back.
   */
  function send(work: PromiseLike<{ error: unknown }>): void {
    void Promise.resolve(work).then(({ error }) => {
      if (!error) return;
      setError(`Could not save to the database: ${readError(error)}`);
      reload();
    });
  }

  function rowFor(item: T, userId: string): Row {
    return { ...config.toRow(item), user_id: userId };
  }

  return {
    subscribe(listener) {
      listeners.add(listener);

      // Started here rather than in `getSnapshot` because this runs from an
      // effect: kicking off a fetch during render and publishing into it is
      // what React warns about.
      if (!started) {
        started = true;
        subscribeToSession(syncToSession);
        syncToSession();

        // Two tabs used to stay in step through the `storage` event, which the
        // localStorage store got for free. A database has no such event, so
        // this re-reads the list whenever a tab is looked at again — which is
        // when a stale list would actually be noticed. It is not live sync: a
        // second tab sitting visible alongside the first will not update until
        // it is focused.
        window.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reload();
        });
        window.addEventListener("focus", reload);
      }

      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot: () => snapshot,
    getServerSnapshot: () => empty,
    items: () => snapshot.items,

    insert(item) {
      const userId = currentUserId();
      if (!userId) return;
      setItems([item, ...snapshot.items]);

      const supabase = getSupabase();
      if (supabase) send(supabase.from(config.table).insert(rowFor(item, userId)));
    },

    update(item) {
      const userId = currentUserId();
      if (!userId) return;
      const id = config.idOf(item);
      setItems(
        snapshot.items.map((existing) => (config.idOf(existing) === id ? item : existing)),
      );

      const supabase = getSupabase();
      if (supabase) {
        // No `user_id` filter needed — row level security already restricts an
        // update to rows this reader owns.
        send(supabase.from(config.table).update(config.toRow(item)).eq("id", id));
      }
    },

    remove(ids) {
      if (ids.length === 0) return;
      const doomed = new Set(ids);
      setItems(snapshot.items.filter((item) => !doomed.has(config.idOf(item))));

      const supabase = getSupabase();
      if (supabase) send(supabase.from(config.table).delete().in("id", [...doomed]));
    },

    replaceAll(items) {
      const userId = currentUserId();
      if (!userId) return;
      setItems(items);

      const supabase = getSupabase();
      if (!supabase) return;

      // Delete-then-insert rather than an upsert: a restore means "the backup
      // is now the whole list", so rows absent from the backup have to go. The
      // two steps are not one transaction, so a failure between them can leave
      // the list short — the reload in `send` will show exactly that rather
      // than pretend otherwise.
      send(
        supabase
          .from(config.table)
          .delete()
          .eq("user_id", userId)
          .then(({ error }) =>
            error || items.length === 0
              ? { error }
              : supabase.from(config.table).insert(items.map((item) => rowFor(item, userId))),
          ),
      );
    },

    insertMany(items) {
      const userId = currentUserId();
      if (!userId || items.length === 0) return;
      setItems([...items, ...snapshot.items]);

      const supabase = getSupabase();
      if (supabase) {
        send(supabase.from(config.table).insert(items.map((item) => rowFor(item, userId))));
      }
    },

    clearError() {
      if (snapshot.error === null) return;
      publish({ items: snapshot.items, loaded: snapshot.loaded, error: null });
    },
  };
}

/** Pulls a readable sentence out of whatever Supabase handed back. */
function readError(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const { message } = error as { message?: unknown };
    if (typeof message === "string" && message) return message;
  }
  return "unknown error";
}

/**
 * A database-friendly id, generated client-side so an optimistic insert already
 * knows the row's real primary key.
 */
export function createId(): string {
  return crypto.randomUUID();
}
