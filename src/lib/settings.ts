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
  DEFAULT_SOURCES,
  MAX_LIST_LENGTH,
} from "@/lib/constants";
import { currentUserId, subscribe as subscribeToSession } from "@/lib/session";
import { getSupabase } from "@/lib/supabaseClient";
import { readNameList, readString } from "@/lib/types";

export type Settings = {
  displayName: string;
  /** The groups the term form offers. A term may still carry only three. */
  categories: string[];
  /** In the reader's own order, which is what the Source column sorts by. */
  sources: string[];
  /**
   * The people every conjugation table is built from — ich, du, er/sie/es,
   * and so on. Empty means never asked, which is what makes the first verb
   * table ask before it is made.
   */
  verbPersons: string[];
};

export const DEFAULT_SETTINGS: Settings = {
  displayName: "",
  categories: [...DEFAULT_CATEGORIES],
  sources: [...DEFAULT_SOURCES],
  // Deliberately empty: there is no sensible default set of persons, and
  // emptiness is the signal to ask.
  verbPersons: [],
};

export type SettingsSnapshot = {
  settings: Settings;
  /** False until the first read has come back. */
  loaded: boolean;
  /** Set when a write failed and the row was re-read to match the database. */
  error: string | null;
};

const EMPTY: SettingsSnapshot = { settings: DEFAULT_SETTINGS, loaded: false, error: null };

/** How long after a read another catch-up read is considered pointless. */
const REFRESH_GAP_MS = 2000;

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

function readError(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Unknown error";
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
  };
}

async function load(userId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  loading = true;
  try {
    const { data, error } = await supabase
      .from("user_settings")
      .select("*")
      .maybeSingle();

    // A sign-out or account switch while the request was in flight.
    if (currentUserId() !== userId) return;

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
    window.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refresh();
    });
    window.addEventListener("focus", refresh);
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
        sources: next.sources,
        verb_persons: next.verbPersons,
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
