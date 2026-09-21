/**
 * The phrase store — the term list's sibling, built on the same plumbing.
 *
 * Phrases carry no dates: they are looked up by wording, not by when they were
 * captured, so the list keeps the order they were added in (newest first) and
 * offers sorting by the phrase itself. The database still needs something to
 * sort on, so rows carry a `created_at` that the app never shows.
 */

import { foldName } from "@/lib/foldName";
import { planImport } from "@/lib/planImport";
import { createId, createRemoteStore } from "@/lib/remoteStore";
import {
  readCategories,
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
    categories: readCategories(value.categories),
    ref: readString(value.ref),
  };
}

const store = createRemoteStore<Phrase>({
  table: "phrases",
  orderBy: "created_at",
  idOf: (phrase) => phrase.id,
  nameOf: (phrase) => phrase.phrase,

  fromRow(row) {
    const id = readString(row.id);
    const phrase = readString(row.phrase).trim();
    if (!id || !phrase) return null;

    return {
      id,
      phrase,
      literalMeaning: readString(row.literal_meaning),
      usageExample: readString(row.usage_example),
      categories: readCategories(row.categories),
      ref: readString(row.ref),
    };
  },

  toRow: (phrase) => ({
    id: phrase.id,
    phrase: phrase.phrase,
    literal_meaning: phrase.literalMeaning,
    usage_example: phrase.usageExample,
    categories: phrase.categories,
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
    // Trimmed, de-duplicated and capped here as well as in the form, so a
    // value arriving from an import obeys the same rule as a typed one.
    categories: readCategories(input.categories),
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

export const deletePhrases = store.removeMany;

/* ----------------------------------------------------------------- queries */

export function getPhrases(): Phrase[] {
  return store.items();
}

/** Case-insensitive lookup, used for the duplicate check before saving. */
export const findByPhrase = store.findByName;

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
  const plan = planImport(store.items(), incoming, mode, {
    keyOf: (phrase) => foldName(phrase.phrase),
    idOf: (phrase) => phrase.id,
    withId: (phrase, id) => ({ ...phrase, id }),
    merge: (existing, candidate) => ({ ...candidate, id: existing.id }),
  });

  if (plan.toReplace) {
    store.replaceAll(plan.toReplace);
    return plan.counts;
  }

  store.updateMany(plan.toUpdate);
  store.insertMany(plan.toInsert);
  return plan.counts;
}
