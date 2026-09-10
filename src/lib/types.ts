import { DEFAULT_SOURCE, MAX_CATEGORIES, type Source } from "@/lib/constants";

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

/* ------------------------------------------------------------------- verbs */

/** One person's line in a conjugation table. */
export type VerbRow = {
  /** ich, du, er/sie/es … — from the list configured in Settings. */
  person: string;
  conjugation: string;
  notes: string;
};

/**
 * A verb's conjugation table. Tied to its term by name rather than by id,
 * the same way a `[[Name]]` reference resolves.
 */
export type VerbTable = {
  id: string;
  verb: string;
  rows: VerbRow[];
  createdAt: string;
};

/** How many rows one table may hold, matching the check on the table. */
export const MAX_VERB_ROWS = 30;

/**
 * Rows off a jsonb column, or off a backup. Anything unreadable is skipped
 * rather than throwing: a table with one odd row should still open.
 */
export function readVerbRows(value: unknown): VerbRow[] {
  if (!Array.isArray(value)) return [];
  const rows: VerbRow[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;
    const person = readString(row.person).trim();
    if (!person) continue;
    rows.push({
      person,
      conjugation: readString(row.conjugation),
      notes: readString(row.notes),
    });
    if (rows.length === MAX_VERB_ROWS) break;
  }
  return rows;
}

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

/**
 * A source off unknown JSON. Sources are the reader's own list now, so
 * anything non-blank is a real source; only a missing or empty one falls
 * back to the default.
 */
export function readSource(value: unknown): Source {
  return readString(value).trim() || DEFAULT_SOURCE;
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
 * A list of names from anywhere untrusted — a database row, a backup file, a
 * form. Trimmed, blanks dropped, duplicates removed case-insensitively (the
 * first spelling wins), and capped, so the same rules hold whichever door the
 * data came through.
 */
export function readNameList(value: unknown, limit: number): string[] {
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
    if (names.length === limit) break;
  }
  return names;
}

/**
 * The categories on one term. Never a union of the configured names: a
 * category saved before the list was edited is still a real category on that
 * term, and dropping it silently would lose data.
 */
export function readCategories(value: unknown): string[] {
  return readNameList(value, MAX_CATEGORIES);
}
