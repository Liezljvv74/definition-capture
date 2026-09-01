import {
  DEFAULT_MODULE_TAG,
  DEFAULT_SOURCE,
  MODULE_TAGS,
  SOURCES,
  type ModuleTag,
  type Source,
} from "@/lib/constants";

/** A single glossary entry as it is stored and displayed. */
export type Entry = {
  id: string;
  term: string;
  definition: string;
  moduleTag: ModuleTag;
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
  moduleTag: ModuleTag;
  source: Source;
};

export const EMPTY_ENTRY_INPUT: EntryInput = {
  term: "",
  definition: "",
  moduleTag: DEFAULT_MODULE_TAG,
  source: DEFAULT_SOURCE,
};

export function isModuleTag(value: unknown): value is ModuleTag {
  return (
    typeof value === "string" && (MODULE_TAGS as readonly string[]).includes(value)
  );
}

export function isSource(value: unknown): value is Source {
  return typeof value === "string" && (SOURCES as readonly string[]).includes(value);
}

/** "Needs definition" is never trusted from storage — it is recomputed from the text. */
export function needsDefinition(definition: string): boolean {
  return definition.trim().length === 0;
}
