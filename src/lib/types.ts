import { DEFAULT_SOURCE, SOURCES, type Source } from "@/lib/constants";

/** A single glossary entry as it is stored and displayed. */
export type Entry = {
  id: string;
  term: string;
  definition: string;
  /** Free-text reference; `parseRef` turns any links inside it into anchors. */
  ref: string;
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
  source: Source;
};

export const EMPTY_ENTRY_INPUT: EntryInput = {
  term: "",
  definition: "",
  ref: "",
  source: DEFAULT_SOURCE,
};

export function isSource(value: unknown): value is Source {
  return typeof value === "string" && (SOURCES as readonly string[]).includes(value);
}

/** "Needs definition" is never trusted from storage — it is recomputed from the text. */
export function needsDefinition(definition: string): boolean {
  return definition.trim().length === 0;
}
