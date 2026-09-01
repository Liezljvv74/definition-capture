/**
 * The phrase store — the glossary's sibling, built on the same plumbing.
 *
 * Phrases carry no dates: they are looked up by wording, not by when they were
 * captured, so the list keeps the order they were added in (newest first) and
 * offers sorting by the phrase itself.
 */

import {
  createBrowserStore,
  createId,
  NO_IMPORT,
  type ImportCounts,
  type ImportMode,
} from "@/lib/browserStore";
import { readString, type Phrase, type PhraseInput } from "@/lib/types";

const STORAGE_KEY = "definition-capture.phrases.v1";

/** Turns unknown JSON into a Phrase, or null if it is unusable. */
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

const store = createBrowserStore<Phrase>(STORAGE_KEY, (raw) => parsePhrase(raw));

export const subscribe = store.subscribe;
export const getSnapshot = store.getSnapshot;
export const getServerSnapshot = store.getServerSnapshot;

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
  const phrases = store.items();
  const phrase: Phrase = {
    id: createId(new Set(phrases.map((existing) => existing.id))),
    ...clean(input),
  };
  store.commit([phrase, ...phrases]);
  return phrase;
}

export function updatePhrase(id: string, input: PhraseInput): Phrase | null {
  const phrases = store.items();
  if (!phrases.some((phrase) => phrase.id === id)) return null;

  const updated: Phrase = { id, ...clean(input) };
  store.commit(phrases.map((phrase) => (phrase.id === id ? updated : phrase)));
  return updated;
}

export function deletePhrase(id: string): void {
  const phrases = store.items();
  if (!phrases.some((phrase) => phrase.id === id)) return;
  store.commit(phrases.filter((phrase) => phrase.id !== id));
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

/** Matches on the phrase text, mirroring how the glossary matches on terms. */
export function importPhrases(incoming: Phrase[], mode: ImportMode): ImportCounts {
  const result: ImportCounts = { ...NO_IMPORT };

  if (mode === "replace") {
    const taken = new Set<string>();
    const restored = incoming.map((phrase) => {
      const id = phrase.id && !taken.has(phrase.id) ? phrase.id : createId(taken);
      taken.add(id);
      return { ...phrase, id };
    });
    result.added = restored.length;
    store.commit(restored);
    return result;
  }

  const next = [...store.items()];
  const indexByPhrase = new Map(
    next.map((phrase, index) => [phrase.phrase.toLocaleLowerCase(), index]),
  );
  const taken = new Set(next.map((phrase) => phrase.id));

  for (const candidate of incoming) {
    const key = candidate.phrase.toLocaleLowerCase();
    const existingIndex = indexByPhrase.get(key);

    if (existingIndex !== undefined) {
      if (mode === "skip") {
        result.skipped += 1;
        continue;
      }
      next[existingIndex] = { ...candidate, id: next[existingIndex].id };
      result.updated += 1;
      continue;
    }

    const id = candidate.id && !taken.has(candidate.id) ? candidate.id : createId(taken);
    taken.add(id);
    next.push({ ...candidate, id });
    indexByPhrase.set(key, next.length - 1);
    result.added += 1;
  }

  if (result.added > 0 || result.updated > 0) store.commit(next);
  return result;
}
