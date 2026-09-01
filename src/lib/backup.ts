/**
 * One backup file covers both lists. Keeping them together means a single
 * Export gives you everything — there is no second file to remember.
 */

import type { ImportCounts, ImportMode } from "@/lib/browserStore";
import { getPhrases, importPhrases, parsePhraseList } from "@/lib/phraseStorage";
import { getEntries, importEntries, parseEntryList } from "@/lib/storage";
import type { Entry, Phrase } from "@/lib/types";

export const BACKUP_FORMAT = "definition-capture-backup";
/** 1 was terms only; 2 adds the phrase list. Version 1 files still import. */
export const BACKUP_VERSION = 2;

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  entries: Entry[];
  phrases: Phrase[];
};

export function buildBackup(): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    entries: getEntries(),
    phrases: getPhrases(),
  };
}

export type BackupContents = {
  entries: Entry[];
  phrases: Phrase[];
  /** Rows in the file that could not be read as either kind. */
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

  // A bare array is treated as a list of glossary entries, which is what a
  // hand-written file or a very early export looks like.
  const bare = asArray(raw);
  if (bare) {
    const { entries, unreadable } = parseEntryList(bare);
    return entries.length > 0
      ? { ok: true, entries, phrases: [], unreadable }
      : { ok: false, error: "That backup contains no readable terms." };
  }

  if (typeof raw !== "object" || raw === null) {
    return {
      ok: false,
      error:
        "That file does not look like a Definition Capture backup — it has no list of entries.",
    };
  }

  const { entries: rawEntries, phrases: rawPhrases } = raw as {
    entries?: unknown;
    phrases?: unknown;
  };
  const entryList = asArray(rawEntries);
  const phraseList = asArray(rawPhrases);

  if (!entryList && !phraseList) {
    return {
      ok: false,
      error:
        "That file does not look like a Definition Capture backup — it has no list of entries.",
    };
  }

  const parsedEntries = entryList
    ? parseEntryList(entryList)
    : { entries: [], unreadable: 0 };
  const parsedPhrases = phraseList
    ? parsePhraseList(phraseList)
    : { phrases: [], unreadable: 0 };

  if (parsedEntries.entries.length === 0 && parsedPhrases.phrases.length === 0) {
    return { ok: false, error: "That backup contains no readable terms or phrases." };
  }

  return {
    ok: true,
    entries: parsedEntries.entries,
    phrases: parsedPhrases.phrases,
    unreadable: parsedEntries.unreadable + parsedPhrases.unreadable,
  };
}

export type ImportResult = { terms: ImportCounts; phrases: ImportCounts };

/**
 * Applies a parsed backup to both lists with the same mode. "Replace" only
 * wipes a list the file actually carries, so restoring a terms-only backup
 * cannot silently delete every phrase.
 */
export function applyImport(contents: BackupContents, mode: ImportMode): ImportResult {
  return {
    terms: importEntries(contents.entries, mode),
    phrases:
      mode === "replace" && contents.phrases.length === 0
        ? { added: 0, updated: 0, skipped: 0 }
        : importPhrases(contents.phrases, mode),
  };
}
