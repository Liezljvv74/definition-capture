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

import {
  getPhrases,
  importPhrases,
  parsePhraseList,
  toWirePhrase,
  type WirePhrase,
} from "@/lib/phraseStorage";
import {
  currentSettings,
  parseSettings,
  saveSettings,
  type Settings,
} from "@/lib/settings";
import {
  getEntries,
  importEntries,
  parseEntryList,
  toWireWord,
  type WireWord,
} from "@/lib/storage";
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
  toWireVerbTable,
  type WireVerbTable,
} from "@/lib/verbTables";

export const BACKUP_FORMAT = "definition-capture-backup";
/**
 * 1 was terms only; 2 adds the phrase list; 3 adds the conjugation tables and
 * the settings. 4 carried a fourth list of grammar rules, which the app no
 * longer has: a version 4 file still imports, and the rules in it are read
 * past like any other key this module does not know. 5 is 4 with that list
 * dropped again. 6 renames the glossary
 * list from `entries` to `words` and each row's `term` to `word`, following
 * the rename in the app and the database.
 *
 * Older files still import, and that is not a courtesy: 5 and below are what
 * every backup anyone already holds looks like. `parseBackup` reads either
 * list key and `parseEntry` reads either name field, so a file from before
 * the rename restores exactly as it used to.
 *
 * 7 is the first version written through an explicit codec rather than by
 * handing the domain objects to `JSON.stringify`. The only visible difference
 * is that a word no longer carries `needsDefinition`, which was derived from
 * its definition and recomputed on the way back in regardless. A version 6
 * file and a version 7 file each read as the other.
 *
 * 8 adds `dateAdded` to a phrase, which the database had always held and the
 * app had been dropping on the way in. A file from 7 or earlier restores with
 * today's date standing in for the one it never recorded, which is the same
 * thing the word list has always done with a dated row that arrived without
 * one.
 *
 * A missing list reads as an absent one, not an empty one, which is what
 * keeps Replace from wiping what the file predates.
 */
export const BACKUP_VERSION = 8;

/**
 * The lists a backup carries, named once.
 *
 * Everything that has to cover "every list" is keyed on this, so adding a
 * fourth is a compile error in each of those places rather than a list that
 * quietly goes unexported, unread or uncounted. That is not hypothetical: the
 * note at the top of this file records conjugation tables being added as a
 * third list and this module never being widened, so Export left them out and
 * a Replace import then deleted them.
 */
export type BackupList = "words" | "phrases" | "verbTables";

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  /**
   * The wire shapes, not the domain ones. `buildBackup` maps through each
   * store's `toWire`, so what lands in the file is written down in a type
   * somebody has to change on purpose.
   *
   * `settings` below is still written straight out, which is a smaller risk
   * for the one reason worth recording: its fields are its own vocabulary
   * rather than derived from anything, and `parseSettings` already reads that
   * shape explicitly.
   */
  words: WireWord[];
  phrases: WirePhrase[];
  verbTables: WireVerbTable[];
  /**
   * Categories, sources, persons, tenses and the display name. Not a list, so
   * it has no scope of its own: a full backup carries it and a scoped export
   * does not. Null means the file says nothing about settings, which is what
   * every backup written before version 3 looks like.
   */
  settings: Settings | null;
};

/** Which lists an export should carry. */
export type BackupScope = "all" | BackupList;

export function buildBackup(scope: BackupScope = "all"): Backup {
  // Asking what is included, rather than what is excluded: a chain of "not
  // that one" tests silently includes anything newly added.
  const wants = (list: Exclude<BackupScope, "all">) => scope === "all" || scope === list;

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    words: wants("words") ? getEntries().map(toWireWord) : [],
    phrases: wants("phrases") ? getPhrases().map(toWirePhrase) : [],
    verbTables: wants("verbTables") ? getVerbTables().map(toWireVerbTable) : [],
    settings: scope === "all" ? currentSettings() : null,
  };
}

export type BackupContents = {
  words: Entry[];
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

  // A bare array is treated as a list of words, which is what a
  // hand-written file or a very early export looks like.
  const bare = asArray(raw);
  if (bare) {
    const { entries, unreadable } = parseEntryList(bare);
    return entries.length > 0
      ? {
          ok: true,
          words: entries,
          phrases: [],
          verbTables: [],
          settings: null,
          unreadable,
        }
      : { ok: false, error: "That backup contains no readable words." };
  }

  if (typeof raw !== "object" || raw === null) {
    return {
      ok: false,
      error:
        "That file does not look like a Definition Capture backup: it has no list of words.",
    };
  }

  const {
    words: rawWords,
    entries: rawEntries,
    phrases: rawPhrases,
    verbTables: rawVerbTables,
    settings: rawSettings,
  } = raw as {
    words?: unknown;
    entries?: unknown;
    phrases?: unknown;
    verbTables?: unknown;
    settings?: unknown;
  };
  // `words` since version 6, `entries` before it. Whichever the file has.
  const entryList = asArray(rawWords) ?? asArray(rawEntries);
  const phraseList = asArray(rawPhrases);
  const verbTableList = asArray(rawVerbTables);

  const parsedEntries = entryList
    ? parseEntryList(entryList)
    : { entries: [], unreadable: 0 };
  const parsedPhrases = phraseList
    ? parsePhraseList(phraseList)
    : { phrases: [], unreadable: 0 };
  const parsedVerbTables = verbTableList
    ? parseVerbTableList(verbTableList)
    : { tables: [], unreadable: 0 };

  /**
   * What each list turned out to be, one row per list.
   *
   * The two questions below used to be written out by hand — three `&&`s and
   * three more — so a fourth list would have compiled while being left out of
   * both. Keyed on `BackupList`, leaving one out is a build error.
   */
  const lists: Record<BackupList, { present: boolean; readable: number; unreadable: number }> =
    {
      words: {
        present: entryList !== null,
        readable: parsedEntries.entries.length,
        unreadable: parsedEntries.unreadable,
      },
      phrases: {
        present: phraseList !== null,
        readable: parsedPhrases.phrases.length,
        unreadable: parsedPhrases.unreadable,
      },
      verbTables: {
        present: verbTableList !== null,
        readable: parsedVerbTables.tables.length,
        unreadable: parsedVerbTables.unreadable,
      },
    };
  const found = Object.values(lists);

  if (!found.some((list) => list.present)) {
    return {
      ok: false,
      error:
        "That file does not look like a Definition Capture backup: it has no list of words.",
    };
  }

  if (!found.some((list) => list.readable > 0)) {
    return {
      ok: false,
      error: "That backup contains nothing readable.",
    };
  }

  return {
    ok: true,
    words: parsedEntries.entries,
    phrases: parsedPhrases.phrases,
    verbTables: parsedVerbTables.tables,
    settings: parseSettings(rawSettings),
    unreadable: found.reduce((total, list) => total + list.unreadable, 0),
  };
}

export type ImportResult = {
  words: ImportCounts;
  phrases: ImportCounts;
  verbTables: ImportCounts;
  /** Whether the file's settings were written over the reader's own. */
  settingsRestored: boolean;
};

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
    words: leavesListAlone(contents, "words", mode)
      ? { ...NO_IMPORT }
      : importEntries(contents.words, mode),
    phrases: leavesListAlone(contents, "phrases", mode)
      ? { ...NO_IMPORT }
      : importPhrases(contents.phrases, mode),
    verbTables: leavesListAlone(contents, "verbTables", mode)
      ? { ...NO_IMPORT }
      : importVerbTables(contents.verbTables, mode),
    settingsRestored,
  };
}
