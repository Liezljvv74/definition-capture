/**
 * The phrase store — the word list's sibling, built on the same plumbing.
 *
 * Phrases are looked up by wording, not by when they were captured, so the
 * list keeps the order they were added in (newest first), offers sorting by
 * the phrase itself, and spends no column on a date. The `created_at` the
 * database sorts on is carried as `dateAdded` all the same, because the
 * phrase's own page shows it, and a value the reader can ask for is not one
 * worth discarding on the way in.
 */

import { foldName } from "@/lib/foldName";
import { planImport } from "@/lib/planImport";
import { createId, createRemoteStore } from "@/lib/remoteStore";
import type { Source } from "@/lib/constants";
import {
  readCollections,
  readSource,
  readString,
  type ImportCounts,
  type ImportMode,
  type Phrase,
  type PhraseInput,
} from "@/lib/types";

/**
 * A phrase as a backup file spells it. Declared for the reason `WireWord` is:
 * so that renaming a field on `Phrase` is a compile error here instead of a
 * silent change to the file format.
 */
export type WirePhrase = {
  id: string;
  phrase: string;
  literalMeaning: string;
  usageExample: string;
  collections: string[];
  source: Source;
  ref: string;
  dateAdded: string;
};

/** The counterpart to `parsePhrase`: one phrase on its way into a file. */
export function toWirePhrase(phrase: Phrase): WirePhrase {
  return {
    id: phrase.id,
    phrase: phrase.phrase,
    literalMeaning: phrase.literalMeaning,
    usageExample: phrase.usageExample,
    collections: phrase.collections,
    source: phrase.source,
    ref: phrase.ref,
    dateAdded: phrase.dateAdded,
  };
}

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
    // `categories` is the spelling before version 10; see `parseEntry`.
    collections: readCollections(value.collections ?? value.categories),
    source: readSource(value.source),
    ref: readString(value.ref),
    // A backup written before phrases carried a date has none to restore, so
    // the import stands in today's, exactly as the word list does. The
    // alternative, an empty string, would show as a blank field forever.
    dateAdded: readString(value.dateAdded) || new Date().toISOString(),
  };
}

/**
 * A database row as a phrase, and back. Named and exported for the same reason
 * `parsePhrase` is: this pair decides what survives the trip, and a mistake in
 * it is silent. The row is an `items` row with its source and collections
 * already flattened to names by `remoteStore`.
 */
export function fromPhraseRow(row: Record<string, unknown>): Phrase | null {
  const id = readString(row.id);
  const phrase = readString(row.title).trim();
  if (!id || !phrase) return null;

  return {
    id,
    phrase,
    literalMeaning: readString(row.literal_meaning),
    usageExample: readString(row.usage_example),
    collections: readCollections(row.collections),
    // A phrase without a source reads as the default; see `fromWordRow`.
    source: readSource(row.source),
    ref: readString(row.ref),
    // A row always has one, since the column is `not null` with a default.
    // The fallback is for the case that cannot happen but would show as a
    // blank Date added forever if it did, the same stand-in `parsePhrase`
    // makes for a file that predates the field.
    dateAdded: readString(row.created_at) || new Date().toISOString(),
  };
}

export function toPhrasePayload(phrase: Phrase): Record<string, unknown> {
  return {
    id: phrase.id,
    title: phrase.phrase,
    literal_meaning: phrase.literalMeaning,
    usage_example: phrase.usageExample,
    source: phrase.source,
    collections: phrase.collections,
    ref: phrase.ref,
    // `save_items` uses this for a new row and ignores it on an existing one,
    // so an imported phrase keeps the date it was captured rather than the
    // date it was restored, and an edit cannot move a date the form never
    // showed.
    created_at: phrase.dateAdded,
  };
}

const store = createRemoteStore<Phrase>({
  itemType: "phrase",
  idOf: (phrase) => phrase.id,
  nameOf: (phrase) => phrase.phrase,
  fromRow: fromPhraseRow,
  toPayload: toPhrasePayload,
});

export const subscribe = store.subscribe;
export const getSnapshot = store.getSnapshot;
export const getServerSnapshot = store.getServerSnapshot;
export const clearError = store.clearError;
export const subscribeToError = store.subscribeToError;
export const getError = store.getError;
export const reload = store.reload;
export const settled = store.settled;

/* --------------------------------------------------------------- mutations */

function clean(input: PhraseInput) {
  return {
    phrase: input.phrase.trim(),
    literalMeaning: input.literalMeaning.trim(),
    usageExample: input.usageExample.trim(),
    // Trimmed, de-duplicated and capped here as well as in the form, so a
    // value arriving from an import obeys the same rule as a typed one.
    collections: readCollections(input.collections),
    source: input.source,
    ref: input.ref.trim(),
  };
}

export function createPhrase(input: PhraseInput): Phrase {
  const phrase: Phrase = {
    id: createId(),
    ...clean(input),
    dateAdded: new Date().toISOString(),
  };
  store.insert(phrase);
  return phrase;
}

/** Updates in place. `dateAdded` deliberately keeps its original value. */
export function updatePhrase(id: string, input: PhraseInput): Phrase | null {
  const existing = store.items().find((phrase) => phrase.id === id);
  if (!existing) return null;

  const updated: Phrase = { ...existing, ...clean(input) };
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

/** Matches on the phrase text, mirroring how the word list matches on words. */
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
