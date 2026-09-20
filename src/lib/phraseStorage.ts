/**
 * The phrase store — the term list's sibling, built on the same plumbing.
 *
 * Phrases carry no dates: they are looked up by wording, not by when they were
 * captured, so the list keeps the order they were added in (newest first) and
 * offers sorting by the phrase itself. The database still needs something to
 * sort on, so rows carry a `created_at` that the app never shows.
 */

import { foldName } from "@/lib/foldName";
import { createId, createRemoteStore, usableId } from "@/lib/remoteStore";
import {
  NO_IMPORT,
  readString,
  type ImportCounts,
  type ImportMode,
  type Phrase,
  type PhraseInput,
} from "@/lib/types";

/**
 * Turns unknown JSON into a Phrase, or null if it is unusable. This reads the
 * camelCase shape a backup file uses; database rows go through `fromRow`.
 */
export function parsePhrase(raw: unknown, allowMissingId = false): Phrase | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;

  const rawId = readString(value.id).trim();
  const id = rawId || (allowMissingId ? "" : null);
  const phrase = readString(value.phrase).trim() || null;
  if (id === null || !phrase) return null;

  return {
    id,
    phrase,
    literalMeaning: readString(value.literalMeaning),
    usageExample: readString(value.usageExample),
    ref: readString(value.ref),
  };
}

const store = createRemoteStore<Phrase>({
  table: "phrases",
  orderBy: "created_at",
  idOf: (phrase) => phrase.id,

  fromRow(row) {
    const id = readString(row.id);
    const phrase = readString(row.phrase).trim();
    if (!id || !phrase) return null;

    return {
      id,
      phrase,
      literalMeaning: readString(row.literal_meaning),
      usageExample: readString(row.usage_example),
      ref: readString(row.ref),
    };
  },

  toRow: (phrase) => ({
    id: phrase.id,
    phrase: phrase.phrase,
    literal_meaning: phrase.literalMeaning,
    usage_example: phrase.usageExample,
    ref: phrase.ref,
  }),
});

export const subscribe = store.subscribe;
export const getSnapshot = store.getSnapshot;
export const getServerSnapshot = store.getServerSnapshot;
export const clearError = store.clearError;
export const subscribeToError = store.subscribeToError;
export const getError = store.getError;
export const settled = store.settled;

/* --------------------------------------------------------------- mutations */

function clean(input: PhraseInput) {
  return {
    phrase: input.phrase.trim(),
    literalMeaning: input.literalMeaning.trim(),
    usageExample: input.usageExample.trim(),
    ref: input.ref.trim(),
  };
}

export function createPhrase(input: PhraseInput): Phrase {
  const phrase: Phrase = { id: createId(), ...clean(input) };
  store.insert(phrase);
  return phrase;
}

export function updatePhrase(id: string, input: PhraseInput): Phrase | null {
  if (!store.items().some((phrase) => phrase.id === id)) return null;

  const updated: Phrase = { id, ...clean(input) };
  store.update(updated);
  return updated;
}

/** The term list's `deleteEntries` for phrases: many removals, one write. */
export function deletePhrases(ids: readonly string[]): number {
  const present = new Set(store.items().map((phrase) => phrase.id));
  const doomed = [...new Set(ids)].filter((id) => present.has(id));
  if (doomed.length === 0) return 0;

  store.remove(doomed);
  return doomed.length;
}

/* ----------------------------------------------------------------- queries */

export function getPhrases(): Phrase[] {
  return store.items();
}

/** Case-insensitive lookup, used for the duplicate check before saving. */
export function findByPhrase(text: string, ignoreId?: string): Phrase | undefined {
  const needle = foldName(text);
  if (!needle) return undefined;
  return store
    .items()
    .find(
      (phrase) => phrase.id !== ignoreId && foldName(phrase.phrase) === needle,
    );
}

/* ------------------------------------------------------------------ import */

export function parsePhraseList(list: unknown[]): {
  phrases: Phrase[];
  unreadable: number;
} {
  const phrases = list
    .map((item) => parsePhrase(item, true))
    .filter((phrase): phrase is Phrase => phrase !== null);
  return { phrases, unreadable: list.length - phrases.length };
}

/** Matches on the phrase text, mirroring how the term list matches on terms. */
export function importPhrases(incoming: Phrase[], mode: ImportMode): ImportCounts {
  const result: ImportCounts = { ...NO_IMPORT };

  if (mode === "replace") {
    // One row per phrase before anything is sent; see `storage.ts` for why a
    // duplicate in the file would otherwise empty the list and leave it empty.
    const byPhrase = new Map<string, Phrase>();
    for (const phrase of incoming) byPhrase.set(foldName(phrase.phrase), phrase);

    const taken = new Set<string>();
    const restored = [...byPhrase.values()].map((phrase) => {
      const id = usableId(phrase.id, taken);
      taken.add(id);
      return { ...phrase, id };
    });
    result.added = restored.length;
    store.replaceAll(restored);
    return result;
  }

  const byPhrase = new Map(
    store.items().map((phrase) => [foldName(phrase.phrase), phrase]),
  );
  const taken = new Set(store.items().map((phrase) => phrase.id));
  const added: Phrase[] = [];
  /** Matched rows, sent as one write after the loop rather than one each. */
  const updated: Phrase[] = [];
  /**
   * Where in `added` a phrase this same file already introduced is waiting.
   * The new rows are not in the store until the insert below, so a second copy
   * of the same phrase has to merge into the pending one — sending it through
   * `store.update` would `PATCH` a row that does not exist yet and lose it
   * without a word. Same reasoning as the term list; see `storage.ts`.
   */
  const pending = new Map<string, number>();

  for (const candidate of incoming) {
    const key = foldName(candidate.phrase);
    const existing = byPhrase.get(key);

    if (existing) {
      if (mode === "skip") {
        result.skipped += 1;
        continue;
      }
      const merged: Phrase = { ...candidate, id: existing.id };

      const at = pending.get(key);
      if (at === undefined) updated.push(merged);
      else added[at] = merged;

      byPhrase.set(key, merged);
      result.updated += 1;
      continue;
    }

    const id = usableId(candidate.id, taken);
    taken.add(id);
    const phrase = { ...candidate, id };
    pending.set(key, added.length);
    added.push(phrase);
    byPhrase.set(key, phrase);
    result.added += 1;
  }

  store.updateMany(updated);
  store.insertMany(added);
  return result;
}
