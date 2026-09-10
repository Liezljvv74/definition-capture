/**
 * The term list as it was stored before there were accounts.
 *
 * Every list now lives in Supabase, one private copy per signed-in reader (see
 * `remoteStore.ts`). But anything captured before that change is still sitting
 * in this browser's `localStorage`, and it is the only copy — so this module
 * exists to read it once, offer it to the account, and only then let go of it.
 *
 * It is deliberately read-only apart from `forget`. Nothing writes new entries
 * here any more, and nothing should: two stores that both accept writes is how
 * two lists quietly drift apart.
 */

export const LEGACY_ENTRIES_KEY = "definition-capture.entries.v1";
export const LEGACY_PHRASES_KEY = "definition-capture.phrases.v1";

/**
 * Reads one of the old keys, dropping anything unreadable. Corrupt or
 * unavailable storage (private mode, hand-edited JSON) reads as an empty list
 * rather than throwing — a failed migration should not break the page.
 */
export function readLegacyList<T>(
  storageKey: string,
  parseItem: (raw: unknown) => T | null,
): T[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => parseItem(item))
      .filter((item): item is T => item !== null);
  } catch {
    return [];
  }
}

/** True when this browser still holds either of the old lists. */
export function hasLegacyData(): boolean {
  try {
    return (
      window.localStorage.getItem(LEGACY_ENTRIES_KEY) !== null ||
      window.localStorage.getItem(LEGACY_PHRASES_KEY) !== null
    );
  } catch {
    return false;
  }
}

/**
 * Removes the old keys. Called only after the rows have been accepted by the
 * database, or when the reader explicitly declines the import — never
 * speculatively, because this is the point of no return for data that exists
 * nowhere else.
 */
export function forgetLegacyData(): void {
  try {
    window.localStorage.removeItem(LEGACY_ENTRIES_KEY);
    window.localStorage.removeItem(LEGACY_PHRASES_KEY);
  } catch {
    // Nothing useful to do; the import already succeeded.
  }
}
