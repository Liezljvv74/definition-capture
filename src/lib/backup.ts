/**
 * One backup file covers both lists. Keeping them together means a single
 * Export gives you everything — there is no second file to remember.
 */

import { NO_IMPORT, type ImportCounts, type ImportMode } from "@/lib/browserStore";
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

/** Which lists an export should carry. */
export type BackupScope = "all" | "terms" | "phrases";

export function buildBackup(scope: BackupScope = "all"): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    entries: scope === "phrases" ? [] : getEntries(),
    phrases: scope === "terms" ? [] : getPhrases(),
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

/** True when Replace would wipe a list the file carries nothing for. */
export function leavesTermsAlone(contents: BackupContents, mode: ImportMode): boolean {
  return mode === "replace" && contents.entries.length === 0;
}

export function leavesPhrasesAlone(contents: BackupContents, mode: ImportMode): boolean {
  return mode === "replace" && contents.phrases.length === 0;
}

/**
 * Applies a parsed backup to both lists with the same mode. "Replace" only
 * wipes a list the file actually carries, so restoring a single-list export —
 * terms only, or phrases only — cannot silently delete the other list.
 */
export function applyImport(contents: BackupContents, mode: ImportMode): ImportResult {
  return {
    terms: leavesTermsAlone(contents, mode)
      ? { ...NO_IMPORT }
      : importEntries(contents.entries, mode),
    phrases: leavesPhrasesAlone(contents, mode)
      ? { ...NO_IMPORT }
      : importPhrases(contents.phrases, mode),
  };
}
