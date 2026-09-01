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

import writeExcelFile, { type Row, type Sheet } from "write-excel-file/browser";

import { buildBackup } from "@/lib/backup";
import { formatDate } from "@/lib/format";

export type ExportFormat = "json" | "xlsx";

export function backupFileName(format: ExportFormat, date = new Date()): string {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return `definition-capture-backup-${stamp}.${format}`;
}

/** Hands a finished blob to the browser as a download. */
function saveBlob(blob: Blob, fileName: string): void {
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

export type ExportSummary = { fileName: string; count: number };

/** The complete backup — this is the file Import reads. */
export function downloadJsonBackup(): ExportSummary {
  const backup = buildBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const fileName = backupFileName("json");
  saveBlob(blob, fileName);
  return { fileName, count: backup.entries.length + backup.phrases.length };
}

function headerRow(labels: string[]): Row {
  return labels.map((value) => ({ value, type: String, fontWeight: "bold" as const }));
}

/** A workbook with one sheet per list, for reading outside the app. */
export async function downloadExcelBackup(): Promise<ExportSummary> {
  const backup = buildBackup();

  const terms: Sheet<Blob> = {
    sheet: "Terms",
    columns: [{ width: 26 }, { width: 60 }, { width: 12 }, { width: 30 }, { width: 16 }],
    data: [
      headerRow(["Term", "Definition", "Source", "Ref", "Date added"]),
      ...backup.entries.map<Row>((entry) => [
        { value: entry.term, type: String },
        { value: entry.definition, type: String, wrap: true },
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

  const blob = await writeExcelFile([terms, phrases]).toBlob();
  const fileName = backupFileName("xlsx");
  saveBlob(blob, fileName);
  return { fileName, count: backup.entries.length + backup.phrases.length };
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsText(file);
  });
}
