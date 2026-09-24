/**
 * Per-account settings: the display name, and the lists the forms offer. One
 * row in `public.user_settings`, or none at all. An account that has never
 * changed anything has no row, and reads as the defaults in `constants.ts`.
 * The row is created by the first save.
 *
 * Shaped like the list stores in `remoteStore.ts` and read the same way, but
 * deliberately not built on them: that factory is about a list of rows with
 * ids and an order, and this is one row with neither. What is copied is the
 * behaviour that matters — synchronous reads, optimistic writes, and a reload
 * putting the truth back when a write fails.
 */

import {
  DEFAULT_ANSWER_SEPARATORS,
  DEFAULT_CATEGORIES,
  DEFAULT_SOURCES,
  MAX_LIST_LENGTH,
  MAX_SKIP_WORD,
  readSeparators,
} from "@/lib/constants";
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
  /** The groups the word and phrase forms offer. One entry may carry three. */
  categories: string[];
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
  categories: [...DEFAULT_CATEGORIES],
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
 * Categories in alphabetical order, in the account's own language.
 *
 * Kept sorted rather than in the order they were typed. The list has no order
 * anyone chose on purpose, unlike sources, where the order is a rough ranking
 * of trust, and a sorted list is the one a reader can find a name in. Sorted
 * where the list is read as well as where it is saved, so a list saved before
 * this rule shows in order everywhere without having to be saved again: the
 * word and phrase forms offer categories in this order, and the flashcard
 * filter takes its order from the saved list through `sync_category_tags`.
 */
function sortedCategories(categories: string[], language: string): string[] {
  return [...categories].sort(sortingFor(language, []).compareText);
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

/** A row, or the absence of one, as settings. */
function fromRow(row: Record<string, unknown> | null): Settings {
  if (!row) return DEFAULT_SETTINGS;
  const categories = readNameList(row.categories, MAX_LIST_LENGTH);
  const sources = readNameList(row.sources, MAX_LIST_LENGTH);
  return {
    displayName: readString(row.display_name).trim(),
    // An empty stored list means the defaults rather than nothing to pick
    // from — a form with no options is not a state worth honouring.
    categories: categories.length > 0 ? categories : [...DEFAULT_CATEGORIES],
    sources: sources.length > 0 ? sources : [...DEFAULT_SOURCES],
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

/** A row as settings, with the categories in order; see `sortedCategories`. */
function fromRowSorted(row: Record<string, unknown> | null): Settings {
  const settings = fromRow(row);
  return { ...settings, categories: sortedCategories(settings.categories, settings.language) };
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
    const answer = await readWithSkewRetry(
      () => supabase.from("user_settings").select("*").maybeSingle(),
      () => currentUserId() === userId,
    );

    // A sign-out or account switch while the request was in flight.
    if (answer === ABANDONED) return;

    const { data, error } = answer;

    if (error) {
      // Hold on to the settings already in hand rather than snapping the
      // form back to defaults because one read failed.
      publish({ settings: snapshot.settings, loaded: true, error: readError(error) });
      return;
    }

    lastLoadedAt = Date.now();
    publish({
      settings: fromRowSorted((data as Record<string, unknown> | null) ?? null),
      loaded: true,
      // A failed save stays on screen until it is dismissed; a later read
      // succeeding is not the same as the save having worked.
      error: snapshot.error,
    });
  } finally {
    loading = false;
  }
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
 * reader's categories and sources with blanks.
 */
export function parseSettings(raw: unknown): RestoredSettings | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;

  const categories = readNameList(value.categories, MAX_LIST_LENGTH);
  const sources = readNameList(value.sources, MAX_LIST_LENGTH);
  return {
    displayName: readString(value.displayName).trim(),
    // Same fallbacks as `fromRow`: a form with no options to pick from is not
    // a state worth restoring into.
    categories: categories.length > 0 ? categories : [...DEFAULT_CATEGORIES],
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
    categories: readNameList(
      change.categories ?? snapshot.settings.categories,
      MAX_LIST_LENGTH,
    ),
    sources: readNameList(change.sources ?? snapshot.settings.sources, MAX_LIST_LENGTH),
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

  next.categories = sortedCategories(next.categories, next.language);

  // The form guards against this too, but the database refuses an empty
  // source list outright and a rejected write would be a worse way to learn.
  if (next.sources.length === 0) next.sources = [...DEFAULT_SETTINGS.sources];

  publish({ settings: next, loaded: true, error: null });

  const supabase = getSupabase();
  if (!supabase) return;

  void supabase
    .from("user_settings")
    .upsert(
      {
        user_id: userId,
        display_name: next.displayName,
        categories: next.categories,
        sources: next.sources,
        verb_persons: next.verbPersons,
        verb_tenses: next.verbTenses,
        answer_separators: next.answerSeparators,
        language: next.language,
        language_other: next.languageOther,
        sort_skip_words: next.sortSkipWords,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .then(({ error }) => {
      if (!error) return;
      publish({
        ...snapshot,
        error: `Could not save your settings: ${readError(error)}`,
      });
      reload();
    });

  /*
   * The category list exists in two places and they have to agree.
   *
   * `user_settings.categories` is what the word and phrase forms offer;
   * `tags` is what the flashcard filter reads, and until now only a row save
   * wrote to it. So a category typed here was invisible to the filter until
   * something was filed under it, and one deleted here stayed in the filter
   * for good. The function below reconciles them, keeping this list's order
   * and refusing to delete a category that is still on an item, which is what
   * this page promises when it says removing one leaves it where it is.
   *
   * Not awaited and not surfaced: the settings themselves are already saved
   * by the time this runs, and a failure here means the filter is briefly out
   * of step, not that anything the reader typed was lost.
   */
  // A change of language can reorder the categories without changing any of
  // them, and the filter's copy takes its order from this list.
  if (change.categories || change.language !== undefined) {
    void supabase.rpc("sync_category_tags", { names: next.categories });
  }
}
