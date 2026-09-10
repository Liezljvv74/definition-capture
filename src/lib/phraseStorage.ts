/**
 * The phrase store — the glossary's sibling, built on the same plumbing.
 *
 * Phrases carry no dates: they are looked up by wording, not by when they were
 * captured, so the list keeps the order they were added in (newest first) and
 * offers sorting by the phrase itself. The database still needs something to
 * sort on, so rows carry a `created_at` that the app never shows.
 */

import { createId, createRemoteStore } from "@/lib/remoteStore";
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

export function deletePhrase(id: string): void {
  deletePhrases([id]);
}

/** The glossary's `deleteEntries` for phrases: many removals, one write. */
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
  const needle = text.trim().toLocaleLowerCase();
  if (!needle) return undefined;
  return store
    .items()
    .find(
      (phrase) => phrase.id !== ignoreId && phrase.phrase.toLocaleLowerCase() === needle,
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

/** Backups from the localStorage version carry short ids a `uuid` column will
 * not take, so anything unusable is given a fresh one. */
function usableId(id: string, taken: Set<string>): string {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  return isUuid && !taken.has(id) ? id : createId();
}

/** Matches on the phrase text, mirroring how the glossary matches on terms. */
export function importPhrases(incoming: Phrase[], mode: ImportMode): ImportCounts {
  const result: ImportCounts = { ...NO_IMPORT };

  if (mode === "replace") {
    const taken = new Set<string>();
    const restored = incoming.map((phrase) => {
      const id = usableId(phrase.id, taken);
      taken.add(id);
      return { ...phrase, id };
    });
    result.added = restored.length;
    store.replaceAll(restored);
    return result;
  }

  const byPhrase = new Map(
    store.items().map((phrase) => [phrase.phrase.toLocaleLowerCase(), phrase]),
  );
  const taken = new Set(store.items().map((phrase) => phrase.id));
  const added: Phrase[] = [];

  for (const candidate of incoming) {
    const existing = byPhrase.get(candidate.phrase.toLocaleLowerCase());

    if (existing) {
      if (mode === "skip") {
        result.skipped += 1;
        continue;
      }
      store.update({ ...candidate, id: existing.id });
      result.updated += 1;
      continue;
    }

    const id = usableId(candidate.id, taken);
    taken.add(id);
    const phrase = { ...candidate, id };
    added.push(phrase);
    byPhrase.set(candidate.phrase.toLocaleLowerCase(), phrase);
    result.added += 1;
  }

  store.insertMany(added);
  return result;
}
