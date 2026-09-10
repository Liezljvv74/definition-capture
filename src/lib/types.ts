import { DEFAULT_SOURCE, MAX_CATEGORIES, SOURCES, type Source } from "@/lib/constants";

/* ----------------------------------------------------------- term entries  */

/** A single term entry as it is stored and displayed. */
export type Entry = {
  id: string;
  term: string;
  definition: string;
  /** Free-text reference; `parseRef` turns any links inside it into anchors. */
  ref: string;
  /** Up to `MAX_CATEGORIES` group names; empty when the term is unfiled. */
  categories: string[];
  source: Source;
  /** ISO timestamp, set once at creation and never changed by edits. */
  dateAdded: string;
  /** ISO timestamp of the last edit, or null if never edited. */
  dateUpdated: string | null;
  /** Always derived from `definition` — true when there is nothing written yet. */
  needsDefinition: boolean;
};

/** The editable fields a form hands back; everything else is managed for you. */
export type EntryInput = {
  term: string;
  definition: string;
  ref: string;
  categories: string[];
  source: Source;
};

export const EMPTY_ENTRY_INPUT: EntryInput = {
  term: "",
  definition: "",
  ref: "",
  categories: [],
  source: DEFAULT_SOURCE,
};

/* ----------------------------------------------------------------- phrases */

/**
 * A saved phrase. Deliberately date-free: phrases are looked up by wording,
 * not by when they were captured.
 */
export type Phrase = {
  id: string;
  phrase: string;
  literalMeaning: string;
  usageExample: string;
  ref: string;
};

export type PhraseInput = {
  phrase: string;
  literalMeaning: string;
  usageExample: string;
  ref: string;
};

export const EMPTY_PHRASE_INPUT: PhraseInput = {
  phrase: "",
  literalMeaning: "",
  usageExample: "",
  ref: "",
};

/* ------------------------------------------------------------------ import */

/** How an imported list should meet the list already saved. */
export type ImportMode =
  /** Add items that are new; leave existing ones untouched. */
  | "skip"
  /** Add new items and overwrite matching ones from the backup. */
  | "update"
  /** Throw away what is saved and restore the backup wholesale. */
  | "replace";

export type ImportCounts = { added: number; updated: number; skipped: number };

export const NO_IMPORT: ImportCounts = { added: 0, updated: 0, skipped: 0 };

/* --------------------------------------------------------------- helpers   */

export function isSource(value: unknown): value is Source {
  return typeof value === "string" && (SOURCES as readonly string[]).includes(value);
}

/** "Needs definition" is never trusted from storage — it is recomputed from the text. */
export function needsDefinition(definition: string): boolean {
  return definition.trim().length === 0;
}

/** Reads a string field off unknown JSON, falling back to empty. */
export function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Categories from anywhere untrusted — a database row, a backup file, a form.
 * Trimmed, blanks dropped, duplicates removed case-insensitively (the first
 * spelling wins), and capped, so the same three rules hold whichever door the
 * data came through. Not a `Category` union: a name saved before the list in
 * `constants.ts` was edited is still a real category on that term.
 */
export function readCategories(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const names: string[] = [];
  for (const item of value) {
    const name = readString(item).trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length === MAX_CATEGORIES) break;
  }
  return names;
}
