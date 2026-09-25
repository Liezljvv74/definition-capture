/**
 * Per-account settings: the display name, and the lists the forms offer. One
 * row in `public.user_settings`, or none at all, plus the account's rows in
 * `tags` (its collections) and `sources`. An account that has never changed
 * anything has none of these, and reads as the defaults in `constants.ts`.
 * The first save creates what it needs.
 *
 * Collections and sources are not columns on the settings row. They are rows
 * that words and phrases point at, so the list here and the names on every
 * item are the same thing rather than two copies to keep in step. Saving one
 * of those lists writes the names added and removed, not the whole list.
 *
 * Shaped like the list stores in `remoteStore.ts` and read the same way, but
 * deliberately not built on them: that factory is about a list of rows with
 * ids and an order, and this is one row with neither. What is copied is the
 * behaviour that matters — synchronous reads, optimistic writes, and a reload
 * putting the truth back when a write fails.
 */

import {
  DEFAULT_ANSWER_SEPARATORS,
  DEFAULT_COLLECTIONS,
  DEFAULT_SOURCES,
  MAX_LIST_LENGTH,
  MAX_SKIP_WORD,
  readSeparators,
} from "@/lib/constants";
import { foldName } from "@/lib/foldName";
import { readLanguageCode, readLanguageName } from "@/lib/languages";
import { sortingFor } from "@/lib/sortName";
import {
  ABANDONED,
  readError,
  readWithSkewRetry,
  REFRESH_GAP_MS,
  watchForRefocus,
} from "@/lib/remoteStore";
import { currentUserId, subscribe as subscribeToSession } from "@/lib/session";
import { getSupabase } from "@/lib/supabaseClient";
import { readNameList, readString } from "@/lib/types";

export type Settings = {
  displayName: string;
  /** The groups the word and phrase forms offer. One entry may be in `MAX_COLLECTIONS`. */
  collections: string[];
  /** In the reader's own order, which is what the Source column sorts by. */
  sources: string[];
  /**
   * The people every conjugation table is built from — ich, du, er/sie/es,
   * and so on. Empty means never asked, which is what makes the first verb
   * table ask before it is made.
   */
  verbPersons: string[];
  /** Tenses offered when making a table; grows as new ones are typed. */
  verbTenses: string[];
  /**
   * Which characters mean "or" when a flashcard answer is marked. Empty is a
   * real answer: it means none of them do, so an entry offering alternatives
   * has to be typed out in full.
   */
  answerSeparators: string;
  /**
   * The language being learned, as an ISO 639-1 code, or "" when none is
   * chosen. Sets the alphabetical order of every list; see `sortName.ts`.
   */
  language: string;
  /**
   * The name of a language the menu does not have, typed in by hand. Only
   * ever set while `language` is "", which the database checks too: the two
   * are one answer, and a row holding both would not say which one it meant.
   */
  languageOther: string;
  /** Leading words Vocabulary sorts past, such as articles. */
  sortSkipWords: string[];
};

export const DEFAULT_SETTINGS: Settings = {
  displayName: "",
  collections: [...DEFAULT_COLLECTIONS],
  sources: [...DEFAULT_SOURCES],
  // Deliberately empty: there is no sensible default set of persons, and
  // emptiness is the signal to ask.
  verbPersons: [],
  verbTenses: [],
  answerSeparators: DEFAULT_ANSWER_SEPARATORS,
  // No language and nothing skipped: the app does not assume one, and what a
  // reader is learning is theirs to say.
  language: "",
  languageOther: "",
  sortSkipWords: [],
};

/**
 * The words to skip, from anywhere untrusted. The same rules as every other
 * name list, and a word too long to be an article is dropped rather than cut
 * short into a different word.
 */
export function readSkipWords(value: unknown): string[] {
  return readNameList(value, MAX_LIST_LENGTH).filter((word) => word.length <= MAX_SKIP_WORD);
}

/**
 * A chosen language and a typed-in one are one answer, not two. A code wins,
 * because it is the one the menu offered.
 */
function readLanguage(code: unknown, other: unknown): Pick<Settings, "language" | "languageOther"> {
  const language = readLanguageCode(code);
  return { language, languageOther: language ? "" : readLanguageName(other) };
}

/**
 * A settings list in alphabetical order, in the account's own language.
 *
 * Collections, sources and tenses are kept sorted rather than in the order
 * they were typed, because a sorted list is the one a reader can find a name
 * in. Sorted where the lists are read as well as where they are saved, so a
 * list saved before this rule shows in order everywhere without having to be
 * saved again: the forms and the flashcard filter offer these in this order.
 *
 * Verb persons are the exception, and deliberately so. Their order is the row
 * order of every new conjugation table, which follows grammar (ich, du,
 * er/sie/es) rather than the alphabet, so they stay as the reader added them.
 */
function sortedNames(names: string[], language: string): string[] {
  return [...names].sort(sortingFor(language, []).compareText);
}

export type SettingsSnapshot = {
  settings: Settings;
  /** False until the first read has come back. */
  loaded: boolean;
  /** Set when a write failed and the row was re-read to match the database. */
  error: string | null;
};

const EMPTY: SettingsSnapshot = { settings: DEFAULT_SETTINGS, loaded: false, error: null };

let snapshot: SettingsSnapshot = EMPTY;
let started = false;
let cachedFor: string | null = null;
let loading = false;
let lastLoadedAt = 0;
/**
 * Watchers of the settings themselves, and watchers of only the error. Split
 * for the reason `remoteStore.ts` gives: the banner is mounted on every page,
 * so one shared set can never answer "is anyone looking at this?".
 */
const listeners = new Set<() => void>();
const errorListeners = new Set<() => void>();

function publish(next: SettingsSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
  for (const listener of errorListeners) listener();
}

/**
 * The collection and source names the database holds, exactly as spelled
 * there. Kept apart from `snapshot`, which shows the defaults to an account
 * with none of its own: a save compares against these to know which rows to
 * add and which to delete, and comparing against defaults nobody stored
 * would try to delete rows that do not exist.
 */
let storedCollections: string[] = [];
let storedSources: string[] = [];

/** For the two lists that are rows rather than a capped array; see `fromRow`. */
const NO_LIMIT = Number.MAX_SAFE_INTEGER;

/** A row, or the absence of one, and the account's list names, as settings. */
function fromRow(
  row: Record<string, unknown> | null,
  collectionNames: string[],
  sourceNames: string[],
): Settings {
  // Not capped at `MAX_LIST_LENGTH` like the other lists. These are rows,
  // and a save deletes whatever is stored but missing from the list, so a
  // name cut off here would be deleted by the next save. The editor still
  // refuses to add past the limit.
  const collections = readNameList(collectionNames, NO_LIMIT);
  const sources = readNameList(sourceNames, NO_LIMIT);
  const lists = {
    // An empty stored list means the defaults rather than nothing to pick
    // from — a form with no options is not a state worth honouring.
    collections: collections.length > 0 ? collections : [...DEFAULT_COLLECTIONS],
    sources: sources.length > 0 ? sources : [...DEFAULT_SOURCES],
  };
  if (!row) return { ...DEFAULT_SETTINGS, ...lists };
  return {
    displayName: readString(row.display_name).trim(),
    ...lists,
    // No fallback here: empty is a real answer, meaning not asked yet.
    verbPersons: readNameList(row.verb_persons, MAX_LIST_LENGTH),
    verbTenses: readNameList(row.verb_tenses, MAX_LIST_LENGTH),
    // No fallback to the default: a reader who has turned every separator off
    // means it, and treating their empty string as "not set" would keep
    // handing them back the commas they just removed.
    answerSeparators: readSeparators(row.answer_separators),
    ...readLanguage(row.language, row.language_other),
    sortSkipWords: readSkipWords(row.sort_skip_words),
  };
}

/** A row as settings, with the sorted lists in order; see `sortedNames`. */
function fromRowSorted(
  row: Record<string, unknown> | null,
  collectionNames: string[],
  sourceNames: string[],
): Settings {
  const settings = fromRow(row, collectionNames, sourceNames);
  return {
    ...settings,
    collections: sortedNames(settings.collections, settings.language),
    sources: sortedNames(settings.sources, settings.language),
    verbTenses: sortedNames(settings.verbTenses, settings.language),
  };
}

async function load(userId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  loading = true;
  try {
    // The same retry the lists use, from the same function rather than a
    // second copy of it. This read is the one most exposed to the clock skew
    // it guards against: it runs on the first workspace page after signing in,
    // with a token minted a moment earlier.
    const stillWanted = () => currentUserId() === userId;
    const [row, collections, sources] = await Promise.all([
      readWithSkewRetry(() => supabase.from("user_settings").select("*").maybeSingle(), stillWanted),
      readWithSkewRetry(
        () => supabase.from("tags").select("name").eq("context", "collection"),
        stillWanted,
      ),
      readWithSkewRetry(() => supabase.from("sources").select("name"), stillWanted),
    ]);

    // A sign-out or account switch while the requests were in flight.
    if (row === ABANDONED || collections === ABANDONED || sources === ABANDONED) return;

    const error = row.error ?? collections.error ?? sources.error;
    if (error) {
      // Hold on to the settings already in hand rather than snapping the
      // form back to defaults because one read failed.
      publish({ settings: snapshot.settings, loaded: true, error: readError(error) });
      return;
    }

    storedCollections = namesOf(collections.data);
    storedSources = namesOf(sources.data);
    lastLoadedAt = Date.now();
    seedDefaults(supabase, userId);
    publish({
      settings: fromRowSorted(
        (row.data as Record<string, unknown> | null) ?? null,
        storedCollections,
        storedSources,
      ),
      loaded: true,
      // A failed save stays on screen until it is dismissed; a later read
      // succeeding is not the same as the save having worked.
      error: snapshot.error,
    });
  } finally {
    loading = false;
  }
}

/**
 * Creates the default collections and sources as rows for an account that has
 * none, the first time its settings load.
 *
 * An account with none is shown the defaults, but shown is not stored: saving
 * a word under "Food" would create that one row, the list would then be
 * non-empty, and the other defaults would vanish from every form. Storing
 * them here, before a form can be used, keeps what the reader was shown.
 */
function seedDefaults(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  userId: string,
): void {
  const seed = (table: "tags" | "sources", names: readonly string[]) =>
    saveNames(supabase, userId, table, [...names]).then(({ error, stored }) => {
      if (error || currentUserId() !== userId) return;
      if (table === "tags") storedCollections = stored;
      else storedSources = stored;
    });
  if (storedCollections.length === 0) void seed("tags", DEFAULT_COLLECTIONS);
  if (storedSources.length === 0) void seed("sources", DEFAULT_SOURCES);
}

/** The `name` column off a list of rows, skipping anything that is not one. */
function namesOf(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => (row as { name?: unknown }).name)
    .filter((name): name is string => typeof name === "string");
}

function reload(): void {
  const userId = currentUserId();
  if (userId) void load(userId);
}

/** The catch-up read for returning to the tab; see `remoteStore.ts`. */
function refresh(): void {
  if (listeners.size === 0) return;
  if (loading || Date.now() - lastLoadedAt < REFRESH_GAP_MS) return;
  reload();
}

function syncToSession(): void {
  const userId = currentUserId();
  if (userId === cachedFor) return;
  cachedFor = userId;

  storedCollections = [];
  storedSources = [];
  if (!userId) {
    publish(EMPTY);
    return;
  }
  publish({ settings: DEFAULT_SETTINGS, loaded: false, error: null });
  void load(userId);
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  if (!started) {
    started = true;
    subscribeToSession(syncToSession);
    syncToSession();
    watchForRefocus(refresh);
  }

  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): SettingsSnapshot {
  return snapshot;
}

export function getServerSnapshot(): SettingsSnapshot {
  return EMPTY;
}

export function currentSettings(): Settings {
  return snapshot.settings;
}

/**
 * Settings as a backup file restores them.
 *
 * The language and its words are optional here where everything else is not:
 * a file written before they existed says nothing about them, and restoring it
 * should leave the reader's own choice alone rather than clear it. Left
 * undefined, `saveSettings` keeps what is already set.
 *
 * `answerSeparators` answers a missing key differently, with the defaults,
 * because a file from before that setting was written by someone marking
 * with the defaults. There is no such answer here: the old fixed rule was
 * German, and restoring a file is no reason to decide the reader is learning
 * German.
 */
export type RestoredSettings = Omit<Settings, "language" | "languageOther" | "sortSkipWords"> &
  Partial<Pick<Settings, "language" | "languageOther" | "sortSkipWords">>;

/**
 * Settings out of a backup file. Reads the camelCase shape an export writes,
 * the way `fromRow` reads a database row.
 *
 * Null means the file carries no settings at all — an older backup, or a
 * scoped one — and that is deliberately different from carrying empty
 * settings: the first restores nothing, the second would overwrite the
 * reader's collections and sources with blanks.
 */
export function parseSettings(raw: unknown): RestoredSettings | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;

  // `categories` is the spelling before version 10; see `parseEntry`.
  const collections = readNameList(value.collections ?? value.categories, MAX_LIST_LENGTH);
  const sources = readNameList(value.sources, MAX_LIST_LENGTH);
  return {
    displayName: readString(value.displayName).trim(),
    // Same fallbacks as `fromRow`: a form with no options to pick from is not
    // a state worth restoring into.
    collections: collections.length > 0 ? collections : [...DEFAULT_COLLECTIONS],
    sources: sources.length > 0 ? sources : [...DEFAULT_SOURCES],
    // No fallback: empty is a real answer, meaning not asked yet.
    verbPersons: readNameList(value.verbPersons, MAX_LIST_LENGTH),
    verbTenses: readNameList(value.verbTenses, MAX_LIST_LENGTH),
    // A file that predates the setting is not a reader who turned every
    // separator off, and the two look identical once `readSeparators` has run:
    // both come back as "". So the absence of the key is answered with the
    // defaults, and only a key that is actually present is taken at its word.
    // Getting this wrong is silent and lasting: restoring any backup written
    // before this field existed would leave every alternative answer having to
    // be typed out in full, with nothing on screen to say why.
    answerSeparators:
      value.answerSeparators === undefined
        ? DEFAULT_ANSWER_SEPARATORS
        : readSeparators(value.answerSeparators),
    ...(value.language === undefined && value.languageOther === undefined
      ? {}
      : readLanguage(value.language, value.languageOther)),
    ...(value.sortSkipWords === undefined
      ? {}
      : { sortSkipWords: readSkipWords(value.sortSkipWords) }),
  };
}

/** Watch only the error, without starting the read; see `remoteStore.ts`. */
export function subscribeToError(listener: () => void): () => void {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

export function getError(): string | null {
  return snapshot.error;
}

export function clearError(): void {
  if (snapshot.error === null) return;
  publish({ ...snapshot, error: null });
}

/* --------------------------------------------------------------- mutations */

/**
 * Writes the changed fields and leaves the rest alone. The screen updates
 * first and the row is upserted behind it; a failure puts the stored truth
 * back and leaves a message for the Settings page to show.
 */
export function saveSettings(change: Partial<Settings>): void {
  const userId = currentUserId();
  if (!userId) return;

  const next: Settings = {
    displayName: (change.displayName ?? snapshot.settings.displayName).trim(),
    collections: readNameList(change.collections ?? snapshot.settings.collections, NO_LIMIT),
    sources: readNameList(change.sources ?? snapshot.settings.sources, NO_LIMIT),
    verbPersons: readNameList(
      change.verbPersons ?? snapshot.settings.verbPersons,
      MAX_LIST_LENGTH,
    ),
    verbTenses: readNameList(
      change.verbTenses ?? snapshot.settings.verbTenses,
      MAX_LIST_LENGTH,
    ),
    answerSeparators: readSeparators(
      change.answerSeparators ?? snapshot.settings.answerSeparators,
    ),
    // Both halves together or neither: choosing a language from the menu has
    // to clear a typed-in one, and typing one in has to clear the code.
    ...(change.language === undefined && change.languageOther === undefined
      ? readLanguage(snapshot.settings.language, snapshot.settings.languageOther)
      : readLanguage(change.language ?? "", change.languageOther ?? "")),
    sortSkipWords: readSkipWords(change.sortSkipWords ?? snapshot.settings.sortSkipWords),
  };

  next.collections = sortedNames(next.collections, next.language);
  next.sources = sortedNames(next.sources, next.language);
  next.verbTenses = sortedNames(next.verbTenses, next.language);

  // The form guards against this too. An empty source list would read back as
  // the defaults anyway (see `fromRow`), so the defaults are what is saved.
  if (next.sources.length === 0) next.sources = [...DEFAULT_SETTINGS.sources];

  publish({ settings: next, loaded: true, error: null });

  const supabase = getSupabase();
  if (!supabase) return;

  const failed = (error: unknown) => {
    publish({
      ...snapshot,
      error: `Could not save your settings: ${readError(error)}`,
    });
    reload();
  };

  // `updated_at` is left to the database, which sets it on every change.
  void supabase
    .from("user_settings")
    .upsert(
      {
        user_id: userId,
        display_name: next.displayName,
        verb_persons: next.verbPersons,
        verb_tenses: next.verbTenses,
        answer_separators: next.answerSeparators,
        language: next.language,
        language_other: next.languageOther,
        sort_skip_words: next.sortSkipWords,
      },
      { onConflict: "user_id" },
    )
    .then(({ error }) => {
      if (error) failed(error);
    });

  if (change.collections) {
    void saveNames(supabase, userId, "tags", next.collections).then(
      ({ error, stored, kept }) => {
        if (error) return failed(error);
        storedCollections = stored;
        // A name still in use was kept rather than removed; read the list
        // again so it shows.
        if (kept) reload();
      },
    );
  }
  if (change.sources) {
    void saveNames(supabase, userId, "sources", next.sources).then(
      ({ error, stored, kept }) => {
        if (error) return failed(error);
        storedSources = stored;
        if (kept) reload();
      },
    );
  }
}

/** The Postgres error code off a Supabase error, if it has one. */
const codeOf = (error: unknown) => (error as { code?: string } | null)?.code;

/**
 * Makes the stored collections or sources match `wanted`: inserts the names
 * that are new, deletes the ones that went. Names are matched the way every
 * name is (`foldName`), so a change of case alone is neither.
 *
 * Two refusals are expected and absorbed rather than reported:
 *
 * - A name something still uses cannot be deleted (23503, the foreign key).
 *   The Settings bin is off for those, so this is a restore whose list lacks
 *   a collection words are still in, or a change made in another tab. The
 *   name is kept, which is what restoring a backup always did: it never took
 *   a collection off a word. `kept` says so, and the caller reloads the list.
 * - A name that already exists cannot be inserted again (23505). A restore
 *   saves this list and its words at the same moment, and `save_items`
 *   creates any collection or source a word names, so the two can race to
 *   create the same one. Whichever lands second has nothing left to do.
 *
 * Either way the batch is retried one name at a time, so one such name does
 * not stop the rest. Renaming is not this: it goes through `renames.ts`.
 *
 * The stored names are read here, every time, rather than taken from what
 * this module last loaded. Saving a word creates any collection or source it
 * names, so a copy held since the page opened can be missing some; and a
 * removal has to name each row as the database spells it, because `.in`
 * matches exactly.
 */
async function saveNames(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  userId: string,
  table: "tags" | "sources",
  wanted: string[],
): Promise<{ error: unknown; stored: string[]; kept: boolean }> {
  const read = await readNames(supabase, table);
  if (read.error) return { error: read.error, stored: [], kept: false };
  const stored = read.names;
  const storedKeys = new Set(stored.map(foldName));
  const wantedKeys = new Set(wanted.map(foldName));
  const added = wanted.filter((name) => !storedKeys.has(foldName(name)));
  const removed = stored.filter((name) => !wantedKeys.has(foldName(name)));
  const context = table === "tags" ? { context: "collection" } : {};

  const remove = async (names: string[]) => {
    let query = supabase.from(table).delete().in("name", names);
    if (table === "tags") query = query.eq("context", "collection");
    return (await query).error;
  };
  const insert = async (names: string[]) =>
    (await supabase.from(table).insert(names.map((name) => ({ user_id: userId, name, ...context }))))
      .error;

  const keptNames: string[] = [];
  if (removed.length > 0) {
    const error = await remove(removed);
    if (codeOf(error) === "23503") {
      for (const name of removed) {
        const one = await remove([name]);
        if (codeOf(one) === "23503") keptNames.push(name);
        else if (one) return { error: one, stored, kept: false };
      }
    } else if (error) {
      return { error, stored, kept: false };
    }
  }
  if (added.length > 0) {
    const error = await insert(added);
    if (codeOf(error) === "23505") {
      for (const name of added) {
        const one = await insert([name]);
        if (one && codeOf(one) !== "23505") return { error: one, stored, kept: false };
      }
    } else if (error) {
      return { error, stored, kept: false };
    }
  }
  return { error: null, stored: [...wanted, ...keptNames], kept: keptNames.length > 0 };
}

/** The account's collection or source names, read now from the database. */
async function readNames(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  table: "tags" | "sources",
): Promise<{ error: unknown; names: string[] }> {
  let query = supabase.from(table).select("name");
  if (table === "tags") query = query.eq("context", "collection");
  const { data, error } = await query;
  return { error, names: namesOf(data) };
}

/**
 * The names the database holds for a list, read now, for `renames.ts`: a
 * rename has to know whether there is a row to rename, and a list loaded
 * when the page opened cannot say, since saving a word can create one.
 */
export async function storedNames(
  list: "collections" | "sources",
): Promise<{ error: unknown; names: string[] }> {
  const supabase = getSupabase();
  if (!supabase) return { error: { message: "no database" }, names: [] };
  return readNames(supabase, list === "collections" ? "tags" : "sources");
}

/**
 * Shows a rename the database has already made, without writing anything:
 * the rename itself went through `rename_tag` or `rename_item_source`, and
 * saving the list here would try to insert a name that now exists.
 */
export function noteRenamed(list: "collections" | "sources", from: string, to: string): void {
  const swap = (names: readonly string[]) => {
    const renamed = names.map((name) => (foldName(name) === foldName(from) ? to : name));
    // A rename onto a name already there was a merge, so the two become one.
    return readNameList(renamed, NO_LIMIT);
  };
  if (list === "collections") storedCollections = swap(storedCollections);
  else storedSources = swap(storedSources);

  const settings = snapshot.settings;
  publish({
    ...snapshot,
    settings: { ...settings, [list]: sortedNames(swap(settings[list]), settings.language) },
  });
  // Then the truth: after a merge the database kept the target's spelling,
  // which may differ in case from what was typed.
  reload();
}
