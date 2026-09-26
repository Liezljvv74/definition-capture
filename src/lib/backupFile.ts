/**
 * Browser file plumbing for exports: turning the lists into a downloaded
 * file, and reading a chosen file back as text. All of the data rules live in
 * the stores and in `backup.ts` — this module only moves bytes in and out of
 * the page.
 *
 * Two formats, for two different jobs:
 *   json   the complete backup, and the only one Import can read again
 *   xlsx   a readable workbook for working with the lists outside the app
 */

// Types only — erased at compile time, so this import costs the bundle
// nothing. The library itself is fetched on demand in `downloadExcelBackup`:
// it is ~30 KB gzipped, it is the fifth largest chunk in the build, and it
// is needed only when someone actually asks for a workbook.
import type { Row, Sheet } from "write-excel-file/browser";

import { buildBackup, type Backup, type BackupList, type BackupScope } from "@/lib/backup";
import { flattenBlocks } from "@/lib/blocks";
import { saveToExportFolder } from "@/lib/exportFolder";
import { formatDate } from "@/lib/format";

export type ExportFormat = "json" | "xlsx";

/**
 * What each scope is called in a file name.
 *
 * A `Record` rather than the scope itself, so the list keys stay the ones the
 * file format uses while the names people read stay readable: `verbTables` is
 * the key inside the JSON and `-verbs-` is what belongs in a file name. A new
 * scope with no name here is a build error.
 */
const SCOPE_FILE_WORD: Record<BackupScope, string> = {
  all: "backup",
  words: "words",
  phrases: "phrases",
  verbTables: "verbs",
  rules: "grammar",
};

/** The file name says what is inside, so scoped exports are told apart later. */
export function backupFileName(
  format: ExportFormat,
  scope: BackupScope = "all",
  date = new Date(),
): string {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return `definition-capture-${SCOPE_FILE_WORD[scope]}-${stamp}.${format}`;
}

/** Hands a finished blob to the browser as a download. */
function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before releasing the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Puts the finished file where Settings says it goes: the chosen folder when
 * there is one, the browser's download folder otherwise. Answers with the
 * folder's name, or null when it went to the browser.
 *
 * A folder that is configured but unusable throws out of here rather than
 * quietly falling back — someone who has pointed their backups at a folder
 * should be told when they did not land there, not left to find out later.
 */
async function deliver(blob: Blob, fileName: string): Promise<string | null> {
  const folder = await saveToExportFolder(blob, fileName);
  if (folder !== null) return folder;
  downloadBlob(blob, fileName);
  return null;
}

export type ExportSummary = {
  fileName: string;
  count: number;
  /** The folder it was written to, or null for the browser's downloads. */
  folder: string | null;
};

/** The complete backup — this is the file Import reads. */
export async function downloadJsonBackup(
  scope: BackupScope = "all",
): Promise<ExportSummary> {
  const backup = buildBackup(scope);
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const fileName = backupFileName("json", scope);
  const folder = await deliver(blob, fileName);
  return { fileName, folder, count: countOf(backup) };
}

/**
 * How many items the file carries, across every list in it.
 *
 * Keyed on `BackupList` rather than adding three lengths by hand, so a list
 * left out is a build error instead of a success screen quietly under-counting
 * what it just wrote.
 */
function countOf(backup: Backup): number {
  const lists: Record<BackupList, readonly unknown[]> = {
    words: backup.words,
    phrases: backup.phrases,
    verbTables: backup.verbTables,
    rules: backup.rules,
  };
  return Object.values(lists).reduce((total, list) => total + list.length, 0);
}

function headerRow(labels: string[]): Row {
  return labels.map((value) => ({ value, type: String, fontWeight: "bold" as const }));
}

/** A workbook with one sheet per exported list, for reading outside the app. */
export async function downloadExcelBackup(scope: BackupScope = "all"): Promise<ExportSummary> {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const backup = buildBackup(scope);

  const words: Sheet<Blob> = {
    sheet: "Words",
    columns: [
      { width: 26 },
      { width: 60 },
      { width: 24 },
      { width: 12 },
      { width: 30 },
      { width: 16 },
    ],
    data: [
      headerRow(["Word", "Definition", "Collection", "Source", "Ref", "Date added"]),
      ...backup.words.map<Row>((entry) => [
        { value: entry.word, type: String },
        { value: entry.definition, type: String, wrap: true },
        // A spreadsheet cell cannot hold a list, so the collections are
        // joined the way a reader would write them.
        { value: entry.collections.join(", "), type: String },
        { value: entry.source, type: String },
        { value: entry.ref, type: String },
        { value: formatDate(entry.dateAdded), type: String },
      ]),
    ],
  };

  const phrases: Sheet<Blob> = {
    sheet: "Phrases",
    columns: [
      { width: 30 },
      { width: 45 },
      { width: 45 },
      { width: 24 },
      { width: 12 },
      { width: 30 },
      { width: 16 },
    ],
    data: [
      headerRow([
        "Phrase",
        "Literal meaning",
        "Usage example",
        "Collection",
        "Source",
        "Ref",
        "Date added",
      ]),
      ...backup.phrases.map<Row>((phrase) => [
        { value: phrase.phrase, type: String },
        { value: phrase.literalMeaning, type: String, wrap: true },
        { value: phrase.usageExample, type: String, wrap: true },
        // A spreadsheet cell cannot hold a list, so the names are joined the
        // way a reader would write them, as the Words sheet does.
        { value: phrase.collections.join(", "), type: String },
        { value: phrase.source, type: String },
        { value: phrase.ref, type: String },
        { value: formatDate(phrase.dateAdded), type: String },
      ]),
    ],
  };

  /**
   * A conjugation table is a grid, and a sheet is a flat list, so each cell
   * gets its own line: one row per person per tense. Laying the tenses out as
   * columns instead would need every table in the workbook to share the same
   * tenses in the same order, which is exactly what they do not do.
   */
  const verbs: Sheet<Blob> = {
    sheet: "Verb tables",
    columns: [{ width: 22 }, { width: 18 }, { width: 18 }, { width: 28 }, { width: 30 }],
    data: [
      headerRow(["Verb", "Person", "Tense", "Conjugation", "Notes"]),
      ...backup.verbTables.flatMap<Row>((table) =>
        table.rows.flatMap<Row>((row) =>
          table.tenses.map<Row>((tense, at) => [
            { value: table.verb, type: String },
            { value: row.person, type: String },
            { value: tense, type: String },
            { value: row.conjugations[at] ?? "", type: String },
            { value: row.notes, type: String, wrap: true },
          ]),
        ),
      ),
    ],
  };

  const rules: Sheet<Blob> = {
    sheet: "Grammar",
    columns: [{ width: 28 }, { width: 18 }, { width: 80 }, { width: 16 }],
    data: [
      headerRow(["Title", "Topic", "Content", "Date added"]),
      ...backup.rules.map<Row>((rule) => [
        { value: rule.title, type: String },
        { value: rule.topic, type: String },
        // Tables and examples flattened to lines; the JSON backup protects
        // the content, and the sheet is for glancing at it.
        { value: flattenBlocks(rule.blocks), type: String, wrap: true },
        { value: formatDate(rule.dateAdded), type: String },
      ]),
    ],
  };

  // A workbook must have at least one sheet, so a scoped export drops the
  // others. A `Record` rather than an array literal: this is the exact spot
  // the header of `backup.ts` warns about, where a third list was added and
  // this module was not widened, and an array would still compile with one
  // missing. Listed by what is included rather than excluded, for the reason
  // `buildBackup` gives.
  const all: Record<BackupList, Sheet<Blob>> = { words, phrases, verbTables: verbs, rules };
  const sheets = (Object.keys(all) as BackupList[])
    .filter((list) => scope === "all" || scope === list)
    .map((list) => all[list]);

  const blob = await writeExcelFile(sheets).toBlob();
  const fileName = backupFileName("xlsx", scope);
  const folder = await deliver(blob, fileName);
  return { fileName, folder, count: countOf(backup) };
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsText(file);
  });
}
