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

import { foldName } from "@/lib/foldName";
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
  /**
   * Remove every listed id that is actually present, in one write, and say
   * how many went. Ignores ids the list does not hold, so a stale selection
   * cannot make the count lie.
   */
  removeMany: (ids: readonly string[]) => number;
  /**
   * The item with this name, folded the way `foldName` folds every name in
   * the app. `ignoreId` is for the duplicate check while editing, where the
   * item being renamed must not count as a clash with itself.
   */
  findByName: (name: string, ignoreId?: string) => T | undefined;
  /** Throw the whole list away and store these instead — a backup restore. */
  replaceAll: (items: T[]) => void;
  /** Store many new items in one write — the localStorage import. */
  insertMany: (items: T[]) => void;
  /** Replace many existing items in one write — the merge half of an import. */
  updateMany: (items: T[]) => void;
  /** Clear the error banner. */
  clearError: () => void;
  /**
   * Read the list again from the database, for a change made there rather
   * than through this store: renaming a collection rewrites every item filed
   * under it without any of them passing through here. Does nothing for a
   * list nobody has opened yet, since the first page to show it reads it.
   */
  reload: () => void;
  /**
   * Watch only the error, without starting the store.
   *
   * `subscribe` doubles as "someone is looking at this list, go and fetch
   * it", which is right for a page showing the list and wrong for the banner.
   * The banner sits in the workspace layout and only ever reads `error`, so
   * subscribing normally made every page, Settings and Verbs included,
   * fetch the words and phrases it had no intention of showing.
   */
  subscribeToError: (listener: () => void) => () => void;
  getError: () => string | null;
  /**
   * Resolves once every write started so far has been answered.
   *
   * Writes are otherwise fire-and-forget, which is the whole point of an
   * optimistic store. This is for the one caller that cannot be optimistic:
   * the legacy import, which is about to delete the only other copy of the
   * data and so has to know the write really landed.
   */
  settled: () => Promise<void>;
};

type Row = Record<string, unknown>;

/** How long after a read another catch-up read is considered pointless. */
export const REFRESH_GAP_MS = 2000;

/**
 * How long to wait before each re-attempt of a read that failed on a clock
 * complaint. Two retries, roughly two seconds all told — long enough to outlast
 * the drift described in `isNotYetValidError`, short enough that a genuinely
 * broken token still reports itself promptly.
 */
const RETRY_DELAYS_MS = [400, 1500];

/**
 * How many rows to ask for at a time.
 *
 * PostgREST caps any single response at the project's `max_rows`, which is
 * 1000 here and on hosted Supabase by default. A plain `select("*")` past that
 * came back quietly truncated — no error, no flag — and the app showed the
 * first 1000 rows as though they were the whole list. That was not merely a
 * display bug: `buildBackup` reads this same cache, so an export followed by a
 * Replace import deleted every row beyond the cut. Reading in pages until a
 * short one arrives is what makes the list actually complete.
 */
const PAGE_SIZE = 1000;

/**
 * How many ids one delete may name.
 *
 * `.in("id", [...])` is serialised into the query string rather than a body,
 * and `delete()` is an HTTP DELETE, so every id travels in the URL at about 37
 * bytes apiece. "Select all, delete" on a list of a thousand built a 37 KB
 * request line, which a gateway refuses long before Postgres sees it, and
 * because the write is optimistic the reader watched every row disappear
 * before the banner arrived to say it had not worked.
 *
 * 200 keeps a batch near 7 KB, comfortably inside any limit, and the whole
 * delete still counts as one write: see `removeIds`.
 */
const DELETE_BATCH = 200;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Splits a list into runs of at most `size`, for a request that has a limit. */
function inBatches<V>(values: readonly V[], size: number): V[][] {
  const batches: V[][] = [];
  for (let at = 0; at < values.length; at += size) {
    batches.push(values.slice(at, at + size));
  }
  return batches;
}

/**
 * Calls back when the reader returns to the tab.
 *
 * Two tabs used to stay in step through the `storage` event, which the
 * localStorage store got for free. A database has no such event, so every
 * store re-reads when a tab is looked at again — which is when a stale list
 * would actually be noticed. It is not live sync: a second tab sitting
 * visible alongside the first will not update until it is focused.
 *
 * `visibilitychange` and `focus` both fire on the same return, which is why
 * the caller's `refresh` is expected to throttle itself with
 * `REFRESH_GAP_MS`.
 */
export function watchForRefocus(refresh: () => void): void {
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refresh();
  });
  window.addEventListener("focus", refresh);
}

/**
 * True for the one failure worth retrying rather than reporting: the database
 * rejecting a token because its timestamps are in the future.
 *
 * Supabase mints the token in one service and checks it in another. When those
 * two clocks disagree by even a second, a token that was issued *just* now can
 * look as though it comes from the future, and PostgREST answers "JWT issued at
 * future". It is transient by definition — the moment the checking clock
 * catches up, the very same token is accepted — and it lands almost exclusively
 * on the first read after signing in, which is the worst possible moment to
 * show somebody an error about JSON web tokens.
 *
 * Only reads are retried. A write that failed may in fact have succeeded before
 * the response went missing, so sending it again risks storing it twice; a read
 * can be repeated as often as we like.
 */
function isNotYetValidError(error: unknown): boolean {
  const message = readError(error).toLowerCase();
  return message.includes("issued at future") || message.includes("not yet valid");
}

/** What a read gave up on, as distinct from a read that answered. */
export const ABANDONED = Symbol("abandoned");

/**
 * Runs a read, waiting out a token the database thinks comes from the future.
 *
 * This is exported, and every read in the app goes through it, because the
 * alternative was tried and failed: `settings.ts` copied this module's loading
 * behaviour by hand, the retry was added here afterwards, and the copy never
 * got it — so the one read most likely to hit the problem, the settings read
 * on the first page after signing in, still reported a raw JWT complaint. A
 * shared function is what makes a fix like that arrive everywhere at once.
 *
 * `stillWanted` is checked after every await: a sign-out or account switch
 * mid-flight means the answer belongs to the wrong reader, and the caller is
 * told to drop it rather than publish it.
 */
export async function readWithSkewRetry<T extends { error: unknown }>(
  run: () => PromiseLike<T>,
  stillWanted: () => boolean,
): Promise<T | typeof ABANDONED> {
  for (let attempt = 0; ; attempt++) {
    // Called fresh each time: a Supabase query builder can only be awaited
    // once, so a retry needs a new one.
    const answer = await run();
    if (!stillWanted()) return ABANDONED;
    if (!answer.error) return answer;

    if (isNotYetValidError(answer.error) && attempt < RETRY_DELAYS_MS.length) {
      await wait(RETRY_DELAYS_MS[attempt]);
      if (!stillWanted()) return ABANDONED;
      continue;
    }
    return answer;
  }
}

/** The kinds of item the `items` table holds, one list store each. */
export type ItemType = "word" | "phrase" | "verb_table";

/**
 * What a list reads for each item: its own columns, plus the name of its
 * source and the names of its collections, embedded in the same request.
 * The embeds follow the composite foreign keys, so one round trip brings the
 * whole item; `flattenRow` turns them into plain fields for `fromRow`.
 */
const ITEM_SELECT = "*, sources(name), item_tags(position, context, tags(name))";

/**
 * An `items` row with its embeds flattened: `source` is the source's name or
 * "", and `collections` the collection names in the order they were given.
 */
function flattenRow(row: Row): Row {
  const source = row.sources as { name?: unknown } | null;
  const links = Array.isArray(row.item_tags) ? (row.item_tags as Row[]) : [];
  const collections = links
    .filter((link) => link.context === "collection")
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((link) => (link.tags as { name?: unknown } | null)?.name)
    .filter((name): name is string => typeof name === "string");
  return {
    ...row,
    source: typeof source?.name === "string" ? source.name : "",
    collections,
  };
}

/**
 * How many items one `save_items` call carries.
 *
 * Each call is one transaction, so a save of this many or fewer is all or
 * nothing. A restore larger than this is sent in sequence, a batch at a time,
 * which keeps every request body a few hundred kilobytes at most; if a later
 * batch fails, the reload in `send` shows exactly which rows made it.
 */
const SAVE_BATCH = 500;

export type RemoteStoreConfig<T> = {
  /** Which kind of item this list holds; every read and delete is limited to it. */
  itemType: ItemType;
  /** Turns an `items` row, embeds flattened, into an app object. */
  fromRow: (row: Row) => T | null;
  /**
   * Turns an app object into one entry of a `save_items` payload: its id,
   * its fields by column name, and `source` and `collections` by name. No
   * `user_id` and no `item_type`; the store adds the type, and the database
   * takes the owner from the session.
   */
  toPayload: (item: T) => Row;
  /** Reads the id off an app object. */
  idOf: (item: T) => string;
  /**
   * Reads the name an item is known by: the word, the phrase, the verb. Every
   * list has one, and every list matches on it the same way, which is what
   * lets `findByName` live here instead of three times over.
   */
  nameOf: (item: T) => string;
};

export function createRemoteStore<T>(config: RemoteStoreConfig<T>): RemoteStore<T> {
  const empty: StoreSnapshot<T> = { items: [], loaded: false, error: null };
  let snapshot: StoreSnapshot<T> = empty;
  /**
   * Two sets, not one, and the difference is what `refresh` reads.
   *
   * `listeners` is people looking at the list; `errorListeners` is the banner,
   * which sits in the workspace layout and is therefore mounted on every page
   * whether or not this list is on screen. Sharing one set meant it was never
   * empty, so there was no way to ask "is anyone actually watching?" — and the
   * catch-up read on returning to the tab re-fetched every list started
   * earlier in the session, including the ones the current page never shows.
   */
  const listeners = new Set<() => void>();
  const errorListeners = new Set<() => void>();
  let started = false;
  /** The user the cache belongs to, so a sign-out or account switch clears it. */
  let cachedFor: string | null = null;
  /** Guards against overlapping and pointlessly repeated refreshes. */
  let loading = false;
  let lastLoadedAt = 0;

  function publish(next: StoreSnapshot<T>): void {
    snapshot = next;
    for (const listener of listeners) listener();
    for (const listener of errorListeners) listener();
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

    loading = true;
    try {
      const data: unknown[] = [];
      /** Where the last page ended, or null before the first. */
      let after: { createdAt: string; id: string } | null = null;

      for (;;) {
        const cursor = after;
        const answer = await readWithSkewRetry(
          () => {
            let query = supabase
              .from("items")
              .select(ITEM_SELECT)
              .eq("item_type", config.itemType);
            // Keyset paging: each page starts after the last row of the one
            // before, rather than at an offset. An offset makes the database
            // produce and discard every row before it, embeds included, so
            // the last page of a 14,000-word list took about 15 times as long
            // as the first (measured, 959 ms against 62). A cursor makes every
            // page cost the same. The values are quoted because a timestamp
            // carries characters the filter syntax treats as separators.
            if (cursor) {
              query = query.or(
                `created_at.lt."${cursor.createdAt}",` +
                  `and(created_at.eq."${cursor.createdAt}",id.lt.${cursor.id})`,
              );
            }
            return (
              query
                .order("created_at", { ascending: false })
                // Paging needs a total order, and `created_at` is a timestamp
                // that two rows can share. The id settles ties, and the cursor
                // above uses the same pair, so no row is dropped or repeated
                // across a page boundary.
                .order("id", { ascending: false })
                .limit(PAGE_SIZE)
            );
          },
          () => currentUserId() === userId,
        );

        // A sign-out or account switch while the request was in flight: the rows
        // that just arrived belong to the wrong reader, so drop them.
        if (answer === ABANDONED) return;

        if (answer.error) {
          // Keep the rows already in hand. A failed read is not evidence the
          // list is empty, and emptying it here showed the “nothing saved yet”
          // screen to anyone with a full list whenever a refresh went wrong.
          // That holds for a failure half way through paging too: the pages
          // already collected are discarded rather than published as if they
          // were the whole list.
          publish({
            items: snapshot.items,
            loaded: true,
            error: `Could not read your list from the database: ${readError(answer.error)}.`,
          });
          return;
        }

        const batch = answer.data ?? [];
        data.push(...batch);
        // A short page is the last one. A full page means there may be more,
        // so ask again — including the exact-multiple case, where the next
        // request comes back empty and ends the loop.
        if (batch.length < PAGE_SIZE) break;
        const last = batch[batch.length - 1] as Row;
        after = { createdAt: String(last.created_at), id: String(last.id) };
      }

      const items = data
        .map((row) => config.fromRow(flattenRow(row as Row)))
        .filter((item): item is T => item !== null);
      lastLoadedAt = Date.now();
      // `snapshot.error` rather than null: a write that failed is still a
      // write that failed, and this read is the reload that put the truth back
      // on screen. Clearing it here made the banner vanish a moment after it
      // appeared — the silent failure this whole design exists to avoid. Only
      // `clearError`, behind the banner’s Dismiss button, takes it away.
      publish({ items, loaded: true, error: snapshot.error });
    } finally {
      loading = false;
    }
  }

  /** Re-reads the list after a failed write, so the screen matches the database. */
  function reload(): void {
    const userId = currentUserId();
    if (userId) void load(userId);
  }

  /**
   * The catch-up read for coming back to the tab. Unlike `reload`, this one
   * is allowed to decline: `visibilitychange` and `focus` both fire on the
   * same return, and with a store per list that was a pair of identical round
   * trips per list for one alt-tab.
   */
  function refresh(): void {
    // Nobody is showing this list, so there is nothing on screen to be stale.
    // The next page that does show it subscribes, and subscribing reads.
    if (listeners.size === 0) return;
    if (loading || Date.now() - lastLoadedAt < REFRESH_GAP_MS) return;
    reload();
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

  /** Writes that have been sent and not yet answered, for `settled`. */
  const inFlight = new Set<Promise<unknown>>();

  /**
   * Optimistic write: the cache is already updated by the caller, so this only
   * has to report a failure and put the truth back.
   */
  function send(work: PromiseLike<{ error: unknown }>): void {
    const settling = Promise.resolve(work).then(({ error }) => {
      if (!error) return;
      // The whole sentence is built here rather than half of it in the banner,
      // because a read failure and a write failure need different second
      // halves: only this one undoes something the reader just did.
      setError(
        `Could not save to the database: ${readError(error)}. Your list has been ` +
          "reloaded from the database, so anything you just changed may need doing again.",
      );
      reload();
    });

    inFlight.add(settling);
    void settling.finally(() => inFlight.delete(settling));
  }

  /**
   * Shared by `remove` and `removeMany`. A plain function rather than a
   * method reaching through `this`, because the stores hand these out
   * detached: `export const deleteEntries = store.removeMany`. A detached
   * method has no `this`, so it would throw the moment it was called.
   */
  function removeIds(ids: readonly string[]): void {
    if (ids.length === 0) return;
    const doomed = new Set(ids);
    setItems(snapshot.items.filter((item) => !doomed.has(config.idOf(item))));

    const supabase = getSupabase();
    if (!supabase) return;

    // Several requests, but still one `send`, so the optimistic story is
    // unchanged: the reader sees one banner if any batch fails, and the reload
    // that follows shows exactly which rows really went. The batches are sent
    // together rather than in sequence because they are independent, and a
    // partial delete is already the failure mode `send` exists to report.
    send(deleteIds(supabase, [...doomed]));
  }

  /**
   * Deletes by id, in batches, limited to this list's type. Every list shares
   * the one `items` table, so the type filter is what makes certain that a
   * delete meant for Vocabulary can never reach a phrase or a verb table, even
   * if an id somehow crossed over.
   */
  function deleteIds(
    supabase: NonNullable<ReturnType<typeof getSupabase>>,
    ids: string[],
  ): PromiseLike<{ error: unknown }> {
    return Promise.all(
      inBatches(ids, DELETE_BATCH).map((batch) =>
        supabase.from("items").delete().eq("item_type", config.itemType).in("id", batch),
      ),
    ).then((answers) => ({ error: answers.find((answer) => answer.error)?.error ?? null }));
  }

  /**
   * One entry of a `save_items` payload. The type is this list's, whatever
   * `toPayload` said, and there is never an owner: the function takes it from
   * the session and ignores one in the payload, and dropping it here as well
   * means a `toPayload` that carried one by mistake cannot even appear to.
   */
  function payloadFor(item: T): Row {
    const fields: Row = { ...config.toPayload(item), item_type: config.itemType };
    delete fields.user_id;
    return fields;
  }

  /**
   * Saves items through `save_items`, a batch per call and the batches in
   * sequence, stopping at the first failure; see `SAVE_BATCH`. An insert, an
   * update and a whole import are the same call: the function updates the ids
   * it finds and inserts the rest.
   */
  async function saveItems(
    supabase: NonNullable<ReturnType<typeof getSupabase>>,
    items: T[],
  ): Promise<{ error: unknown }> {
    for (const batch of inBatches(items, SAVE_BATCH)) {
      const { error } = await supabase.rpc("save_items", { payload: batch.map(payloadFor) });
      if (error) return { error };
    }
    return { error: null };
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

        watchForRefocus(refresh);
      }

      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot: () => snapshot,
    getServerSnapshot: () => empty,
    items: () => snapshot.items,

    reload() {
      if (started) reload();
    },

    insert(item) {
      if (!currentUserId()) return;
      setItems([item, ...snapshot.items]);

      const supabase = getSupabase();
      if (supabase) send(saveItems(supabase, [item]));
    },

    update(item) {
      if (!currentUserId()) return;
      const id = config.idOf(item);
      setItems(
        snapshot.items.map((existing) => (config.idOf(existing) === id ? item : existing)),
      );

      // No owner in the payload: `save_items` takes it from the session, and
      // row level security already restricts an update to rows this reader
      // owns.
      const supabase = getSupabase();
      if (supabase) send(saveItems(supabase, [item]));
    },

    removeMany(ids) {
      const present = new Set(snapshot.items.map(config.idOf));
      const doomed = [...new Set(ids)].filter((id) => present.has(id));
      removeIds(doomed);
      return doomed.length;
    },

    findByName(name, ignoreId) {
      const needle = foldName(name);
      if (!needle) return undefined;
      return snapshot.items.find(
        (item) => config.idOf(item) !== ignoreId && foldName(config.nameOf(item)) === needle,
      );
    },

    remove: removeIds,

    /**
     * A restore: the backup becomes the whole list.
     *
     * Save first, then delete what the backup does not have. It used to be the
     * other way round, delete everything and insert the backup, and that
     * erased the review history and schedule of every item it touched, even
     * the ones the backup put straight back under the same id, because the
     * delete cascaded into them. Saving over the top keeps an item that stays
     * exactly as it was underneath, progress and all.
     *
     * Only this list's items are deleted, by id: the three lists share one
     * table, and restoring Vocabulary must not touch a phrase.
     */
    replaceAll(items) {
      if (!currentUserId()) return;
      const keep = new Set(items.map(config.idOf));
      const doomed = snapshot.items.map(config.idOf).filter((id) => !keep.has(id));
      setItems(items);

      const supabase = getSupabase();
      if (!supabase) return;

      send(
        saveItems(supabase, items).then(({ error }) =>
          error || doomed.length === 0 ? { error } : deleteIds(supabase, doomed),
        ),
      );
    },

    insertMany(items) {
      if (!currentUserId() || items.length === 0) return;
      setItems([...items, ...snapshot.items]);

      const supabase = getSupabase();
      if (supabase) send(saveItems(supabase, items));
    },

    /**
     * The counterpart to `insertMany`, for the rows an import matched.
     *
     * One `save_items` call for the whole set. For a while this had to be one
     * request per row, because the lists were views and a view cannot take an
     * upsert; the lists are a table again, and the function does the set in
     * one transaction.
     */
    updateMany(items) {
      if (!currentUserId() || items.length === 0) return;

      const replacements = new Map(items.map((item) => [config.idOf(item), item]));
      setItems(
        snapshot.items.map((existing) => replacements.get(config.idOf(existing)) ?? existing),
      );

      const supabase = getSupabase();
      if (supabase) send(saveItems(supabase, items));
    },

    clearError() {
      if (snapshot.error === null) return;
      publish({ items: snapshot.items, loaded: snapshot.loaded, error: null });
    },

    subscribeToError(listener) {
      errorListeners.add(listener);
      return () => {
        errorListeners.delete(listener);
      };
    },

    getError: () => snapshot.error,

    async settled() {
      // A loop rather than one `Promise.all`: a write that fails starts a
      // reload, and waiting for the set to actually empty covers anything
      // that joined while we were waiting.
      while (inFlight.size > 0) await Promise.all([...inFlight]);
    },
  };
}

/**
 * Pulls a readable sentence out of whatever Supabase handed back.
 *
 * Exported so every store words a failure the same way. `settings.ts` had its
 * own copy that coerced non-strings and capitalised the fallback, so the same
 * underlying error read differently depending on which store hit it.
 */
export function readError(error: unknown): string {
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

/**
 * The id an imported row should be saved under.
 *
 * Ids in a backup are whatever the exporting version used — the localStorage
 * store minted short random strings, which the `uuid` primary key will not
 * accept — and one file can name the same id twice. Anything unusable, or
 * already spoken for, is replaced with a fresh one.
 *
 * It lives here rather than in a store because all three lists import the same
 * way, and the regex is the load-bearing part: fixing it in one copy and not
 * the others would silently break importing into whichever list was missed.
 */
export function usableId(id: string, taken: Set<string>): string {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  return isUuid && !taken.has(id) ? id : createId();
}
