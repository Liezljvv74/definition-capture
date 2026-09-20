/**
 * Per-account settings: the display name, and the two lists the term form
 * offers. One row in `public.user_settings`, or none at all — an account that
 * has never changed anything has no row, and reads as the defaults in
 * `constants.ts`. The row is created by the first save.
 *
 * Shaped like the list stores in `remoteStore.ts` and read the same way, but
 * deliberately not built on them: that factory is about a list of rows with
 * ids and an order, and this is one row with neither. What is copied is the
 * behaviour that matters — synchronous reads, optimistic writes, and a reload
 * putting the truth back when a write fails.
 */

import {
  DEFAULT_CATEGORIES,
  DEFAULT_GRAMMAR_CATEGORIES,
  DEFAULT_SOURCES,
  MAX_LIST_LENGTH,
} from "@/lib/constants";
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
  /** The groups the term form offers. A term may still carry only three. */
  categories: string[];
  /** The groups the grammar form offers. A rule carries exactly one, or none. */
  grammarCategories: string[];
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
};

export const DEFAULT_SETTINGS: Settings = {
  displayName: "",
  categories: [...DEFAULT_CATEGORIES],
  grammarCategories: [...DEFAULT_GRAMMAR_CATEGORIES],
  sources: [...DEFAULT_SOURCES],
  // Deliberately empty: there is no sensible default set of persons, and
  // emptiness is the signal to ask.
  verbPersons: [],
  verbTenses: [],
};

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
const listeners = new Set<() => void>();

function publish(next: SettingsSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

/** A row, or the absence of one, as settings. */
function fromRow(row: Record<string, unknown> | null): Settings {
  if (!row) return DEFAULT_SETTINGS;
  const categories = readNameList(row.categories, MAX_LIST_LENGTH);
  const grammarCategories = readNameList(row.grammar_categories, MAX_LIST_LENGTH);
  const sources = readNameList(row.sources, MAX_LIST_LENGTH);
  return {
    displayName: readString(row.display_name).trim(),
    // An empty stored list means the defaults rather than nothing to pick
    // from — a form with no options is not a state worth honouring.
    categories: categories.length > 0 ? categories : [...DEFAULT_CATEGORIES],
    grammarCategories:
      grammarCategories.length > 0
        ? grammarCategories
        : [...DEFAULT_GRAMMAR_CATEGORIES],
    sources: sources.length > 0 ? sources : [...DEFAULT_SOURCES],
    // No fallback here: empty is a real answer, meaning not asked yet.
    verbPersons: readNameList(row.verb_persons, MAX_LIST_LENGTH),
    verbTenses: readNameList(row.verb_tenses, MAX_LIST_LENGTH),
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
      settings: fromRow((data as Record<string, unknown> | null) ?? null),
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
 * Settings out of a backup file. Reads the camelCase shape an export writes,
 * the way `fromRow` reads a database row.
 *
 * Null means the file carries no settings at all — an older backup, or a
 * scoped one — and that is deliberately different from carrying empty
 * settings: the first restores nothing, the second would overwrite the
 * reader's categories and sources with blanks.
 */
export function parseSettings(raw: unknown): Settings | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;

  const categories = readNameList(value.categories, MAX_LIST_LENGTH);
  const grammarCategories = readNameList(value.grammarCategories, MAX_LIST_LENGTH);
  const sources = readNameList(value.sources, MAX_LIST_LENGTH);
  return {
    displayName: readString(value.displayName).trim(),
    // Same fallbacks as `fromRow`: a form with no options to pick from is not
    // a state worth restoring into.
    categories: categories.length > 0 ? categories : [...DEFAULT_CATEGORIES],
    grammarCategories:
      grammarCategories.length > 0
        ? grammarCategories
        : [...DEFAULT_GRAMMAR_CATEGORIES],
    sources: sources.length > 0 ? sources : [...DEFAULT_SOURCES],
    // No fallback: empty is a real answer, meaning not asked yet.
    verbPersons: readNameList(value.verbPersons, MAX_LIST_LENGTH),
    verbTenses: readNameList(value.verbTenses, MAX_LIST_LENGTH),
  };
}

/** Watch only the error, without starting the read; see `remoteStore.ts`. */
export function subscribeToError(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
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
    grammarCategories: readNameList(
      change.grammarCategories ?? snapshot.settings.grammarCategories,
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
  };

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
        grammar_categories: next.grammarCategories,
        sources: next.sources,
        verb_persons: next.verbPersons,
        verb_tenses: next.verbTenses,
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
}
