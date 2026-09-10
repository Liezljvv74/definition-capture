/**
 * Browser file plumbing for exports: turning the two lists into a downloaded
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

import { buildBackup, type BackupScope } from "@/lib/backup";
import { saveToExportFolder } from "@/lib/exportFolder";
import { formatDate } from "@/lib/format";

export type ExportFormat = "json" | "xlsx";

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
  const what = scope === "all" ? "backup" : scope;
  return `definition-capture-${what}-${stamp}.${format}`;
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
  return { fileName, folder, count: backup.entries.length + backup.phrases.length };
}

function headerRow(labels: string[]): Row {
  return labels.map((value) => ({ value, type: String, fontWeight: "bold" as const }));
}

/** A workbook with one sheet per exported list, for reading outside the app. */
export async function downloadExcelBackup(scope: BackupScope = "all"): Promise<ExportSummary> {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const backup = buildBackup(scope);

  const terms: Sheet<Blob> = {
    sheet: "Terms",
    columns: [
      { width: 26 },
      { width: 60 },
      { width: 24 },
      { width: 12 },
      { width: 30 },
      { width: 16 },
    ],
    data: [
      headerRow(["Term", "Definition", "Category", "Source", "Ref", "Date added"]),
      ...backup.entries.map<Row>((entry) => [
        { value: entry.term, type: String },
        { value: entry.definition, type: String, wrap: true },
        // A spreadsheet cell cannot hold a list, so the three names are
        // joined the way a reader would write them.
        { value: entry.categories.join(", "), type: String },
        { value: entry.source, type: String },
        { value: entry.ref, type: String },
        { value: formatDate(entry.dateAdded), type: String },
      ]),
    ],
  };

  const phrases: Sheet<Blob> = {
    sheet: "Phrases",
    columns: [{ width: 30 }, { width: 45 }, { width: 45 }, { width: 30 }],
    data: [
      headerRow(["Phrase", "Literal meaning", "Usage example", "Ref"]),
      ...backup.phrases.map<Row>((phrase) => [
        { value: phrase.phrase, type: String },
        { value: phrase.literalMeaning, type: String, wrap: true },
        { value: phrase.usageExample, type: String, wrap: true },
        { value: phrase.ref, type: String },
      ]),
    ],
  };

  // A workbook must have at least one sheet, so a scoped export drops the other.
  const sheets: Sheet<Blob>[] =
    scope === "terms" ? [terms] : scope === "phrases" ? [phrases] : [terms, phrases];

  const blob = await writeExcelFile(sheets).toBlob();
  const fileName = backupFileName("xlsx", scope);
  const folder = await deliver(blob, fileName);
  return { fileName, folder, count: backup.entries.length + backup.phrases.length };
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsText(file);
  });
}
