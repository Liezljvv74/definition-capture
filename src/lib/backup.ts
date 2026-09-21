/**
 * One backup file covers every list. Keeping them together means a single
 * Export gives you everything — there is no second file to remember.
 *
 * "Every list" was once "both lists", and the gap between the two was a real
 * way to lose data: conjugation tables were added as a third list and this
 * module was never widened, so Export quietly left them out and a Replace
 * import — which deletes before it writes — took them away for good. Adding a
 * list means adding it here.
 */

import { getPhrases, importPhrases, parsePhraseList } from "@/lib/phraseStorage";
import {
  currentSettings,
  parseSettings,
  saveSettings,
  type Settings,
} from "@/lib/settings";
import { getEntries, importEntries, parseEntryList } from "@/lib/storage";
import {
  NO_IMPORT,
  type Entry,
  type ImportCounts,
  type ImportMode,
  type Phrase,
  type VerbTable,
} from "@/lib/types";
import {
  getVerbTables,
  importVerbTables,
  parseVerbTableList,
} from "@/lib/verbTables";

export const BACKUP_FORMAT = "definition-capture-backup";
/**
 * 1 was terms only; 2 adds the phrase list; 3 adds the conjugation tables and
 * the settings. 4 carried a fourth list of grammar rules, which the app no
 * longer has: a version 4 file still imports, and the rules in it are read
 * past like any other key this module does not know.
 *
 * Older files still import: a missing list reads as an absent one, not an
 * empty one, which is what keeps Replace from wiping what the file predates.
 */
export const BACKUP_VERSION = 5;

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  entries: Entry[];
  phrases: Phrase[];
  verbTables: VerbTable[];
  /**
   * Categories, sources, persons, tenses and the display name. Not a list, so
   * it has no scope of its own: a full backup carries it and a scoped export
   * does not. Null means the file says nothing about settings, which is what
   * every backup written before version 3 looks like.
   */
  settings: Settings | null;
};

/** Which lists an export should carry. */
export type BackupScope = "all" | "terms" | "phrases" | "verbs";

export function buildBackup(scope: BackupScope = "all"): Backup {
  // Asking what is included, rather than what is excluded: a chain of "not
  // that one" tests silently includes anything newly added.
  const wants = (list: Exclude<BackupScope, "all">) => scope === "all" || scope === list;

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    entries: wants("terms") ? getEntries() : [],
    phrases: wants("phrases") ? getPhrases() : [],
    verbTables: wants("verbs") ? getVerbTables() : [],
    settings: scope === "all" ? currentSettings() : null,
  };
}

export type BackupContents = {
  entries: Entry[];
  phrases: Phrase[];
  verbTables: VerbTable[];
  settings: Settings | null;
  /** Rows in the file that could not be read as any of the kinds. */
  unreadable: number;
};

export type BackupParse = ({ ok: true } & BackupContents) | { ok: false; error: string };

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

export function parseBackup(text: string): BackupParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file is not valid JSON, so it cannot be read." };
  }

  // A bare array is treated as a list of terms, which is what a
  // hand-written file or a very early export looks like.
  const bare = asArray(raw);
  if (bare) {
    const { entries, unreadable } = parseEntryList(bare);
    return entries.length > 0
      ? {
          ok: true,
          entries,
          phrases: [],
          verbTables: [],
          settings: null,
          unreadable,
        }
      : { ok: false, error: "That backup contains no readable terms." };
  }

  if (typeof raw !== "object" || raw === null) {
    return {
      ok: false,
      error:
        "That file does not look like a Definition Capture backup: it has no list of entries.",
    };
  }

  const {
    entries: rawEntries,
    phrases: rawPhrases,
    verbTables: rawVerbTables,
    settings: rawSettings,
  } = raw as {
    entries?: unknown;
    phrases?: unknown;
    verbTables?: unknown;
    settings?: unknown;
  };
  const entryList = asArray(rawEntries);
  const phraseList = asArray(rawPhrases);
  const verbTableList = asArray(rawVerbTables);

  if (!entryList && !phraseList && !verbTableList) {
    return {
      ok: false,
      error:
        "That file does not look like a Definition Capture backup: it has no list of entries.",
    };
  }

  const parsedEntries = entryList
    ? parseEntryList(entryList)
    : { entries: [], unreadable: 0 };
  const parsedPhrases = phraseList
    ? parsePhraseList(phraseList)
    : { phrases: [], unreadable: 0 };
  const parsedVerbTables = verbTableList
    ? parseVerbTableList(verbTableList)
    : { tables: [], unreadable: 0 };

  if (
    parsedEntries.entries.length === 0 &&
    parsedPhrases.phrases.length === 0 &&
    parsedVerbTables.tables.length === 0
  ) {
    return {
      ok: false,
      error: "That backup contains nothing readable.",
    };
  }

  return {
    ok: true,
    entries: parsedEntries.entries,
    phrases: parsedPhrases.phrases,
    verbTables: parsedVerbTables.tables,
    settings: parseSettings(rawSettings),
    unreadable:
      parsedEntries.unreadable + parsedPhrases.unreadable + parsedVerbTables.unreadable,
  };
}

export type ImportResult = {
  terms: ImportCounts;
  phrases: ImportCounts;
  verbTables: ImportCounts;
  /** Whether the file's settings were written over the reader's own. */
  settingsRestored: boolean;
};

/** The lists a backup carries, named as `BackupContents` names them. */
export type BackupList = "entries" | "phrases" | "verbTables";

/**
 * True when Replace would wipe a list the file carries nothing for.
 *
 * One function keyed on the list rather than one per list. They differed only
 * in which array they measured, and this is the predicate that decides whether
 * a restore deletes something, so three chances to get it subtly different was
 * two too many. The key is checked against
 * `BackupContents`, so a misspelling is a compile error rather than a
 * predicate that quietly answers false and lets the delete through.
 */
export function leavesListAlone(
  contents: BackupContents,
  list: BackupList,
  mode: ImportMode,
): boolean {
  return mode === "replace" && contents[list].length === 0;
}

/**
 * Whether restoring would also put the file's settings back.
 *
 * Settings are one row rather than a list, so "add only what I don't have"
 * has nothing to mean for them — there is always exactly one set. Skip leaves
 * them alone; the two modes that are willing to overwrite saved data
 * overwrite these too.
 */
export function restoresSettings(contents: BackupContents, mode: ImportMode): boolean {
  return mode !== "skip" && contents.settings !== null;
}

/**
 * Applies a parsed backup to every list with the same mode. "Replace" only
 * wipes a list the file actually carries, so restoring a single-list export —
 * or a version 2 file written before conjugation tables existed — cannot
 * silently delete the lists it says nothing about.
 */
export function applyImport(contents: BackupContents, mode: ImportMode): ImportResult {
  const settingsRestored = restoresSettings(contents, mode);
  // Before the lists, so a restored set of sources and categories is already
  // in place for the entries that refer to them.
  if (settingsRestored && contents.settings) saveSettings(contents.settings);

  return {
    terms: leavesListAlone(contents, "entries", mode)
      ? { ...NO_IMPORT }
      : importEntries(contents.entries, mode),
    phrases: leavesListAlone(contents, "phrases", mode)
      ? { ...NO_IMPORT }
      : importPhrases(contents.phrases, mode),
    verbTables: leavesListAlone(contents, "verbTables", mode)
      ? { ...NO_IMPORT }
      : importVerbTables(contents.verbTables, mode),
    settingsRestored,
  };
}
