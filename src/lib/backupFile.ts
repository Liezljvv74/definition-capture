/**
 * Browser file plumbing for backups: turning the glossary into a downloaded
 * file, and reading a chosen file back as text. All of the data rules live in
 * `storage.ts` — this module only moves bytes in and out of the page.
 */

import { buildBackup } from "@/lib/storage";

export function backupFileName(date = new Date()): string {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return `definition-capture-backup-${stamp}.json`;
}

/** Writes the whole glossary to a JSON file and hands it to the browser. */
export function downloadBackup(): { fileName: string; count: number } {
  const backup = buildBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const fileName = backupFileName();

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before releasing the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  return { fileName, count: backup.entries.length };
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsText(file);
  });
}
