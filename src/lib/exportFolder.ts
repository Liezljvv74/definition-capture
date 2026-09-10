/**
 * The folder exports are written to.
 *
 * Everything else the app remembers lives in Supabase, keyed to the account.
 * This one cannot: a folder is granted to *this browser on this machine* as a
 * `FileSystemDirectoryHandle`, an opaque object that is meaningless anywhere
 * else and cannot be turned into text. So it is kept in IndexedDB, which is
 * the only browser store that can hold one — `localStorage` takes strings
 * only. The consequence to know about is that the choice is per browser, not
 * per account.
 *
 * Only Chromium browsers have the picker at all. Where it is missing the app
 * behaves exactly as it did before: the file goes to the browser's own
 * download folder, and the Settings screen says so rather than offering a
 * button that cannot work.
 *
 * Permission is not permanent. The browser may ask again in a new session,
 * and the folder may be moved or deleted between exports, so every write
 * checks first and reports a failure the caller can offer a way out of —
 * silently redirecting someone's backup to a different folder would be worse
 * than an error.
 */

const DB_NAME = "definition-capture";
const DB_VERSION = 1;
const STORE = "settings";
const KEY = "export-folder";

export type ExportFolderSnapshot = {
  /** The folder's display name, or null when exports go to the browser's. */
  name: string | null;
  /** False until IndexedDB has been read on this page. */
  loaded: boolean;
};

const EMPTY: ExportFolderSnapshot = { name: null, loaded: false };

/** A folder was configured but could not be written to. Always shown to the user. */
export class ExportFolderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportFolderError";
  }
}

let snapshot: ExportFolderSnapshot = EMPTY;
let handle: FileSystemDirectoryHandle | null = null;
let started = false;
const listeners = new Set<() => void>();

function publish(next: ExportFolderSnapshot): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

/** True when this browser can offer a folder at all. */
export function supportsExportFolder(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

/* --------------------------------------------------------------- IndexedDB */

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    // A private window, or storage the browser has blocked. Not worth an
    // error: the app simply has no remembered folder.
    request.onerror = () => resolve(null);
  });
}

function readStored(): Promise<FileSystemDirectoryHandle | null> {
  return openDatabase().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(null);
        const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
        request.onsuccess = () =>
          resolve((request.result as FileSystemDirectoryHandle | undefined) ?? null);
        request.onerror = () => resolve(null);
      }),
  );
}

function writeStored(value: FileSystemDirectoryHandle | null): Promise<void> {
  return openDatabase().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve();
        const store = db.transaction(STORE, "readwrite").objectStore(STORE);
        const request = value === null ? store.delete(KEY) : store.put(value, KEY);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
      }),
  );
}

/* ------------------------------------------------------------------- store */

async function restore(): Promise<void> {
  const stored = await readStored();
  handle = stored;
  // Permission is deliberately not requested here: asking needs a click, and
  // this runs on load. The first export does the asking.
  publish({ name: stored?.name ?? null, loaded: true });
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!started) {
    started = true;
    void restore();
  }
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): ExportFolderSnapshot {
  return snapshot;
}

export function getServerSnapshot(): ExportFolderSnapshot {
  return EMPTY;
}

/* ----------------------------------------------------------------- picking */

/**
 * Opens the folder picker and remembers what comes back. Returns false when
 * the dialog was dismissed, which is not an error — the folder is unchanged.
 * Must be called from a click: the browser refuses otherwise.
 */
export async function chooseExportFolder(): Promise<boolean> {
  if (!supportsExportFolder()) {
    throw new ExportFolderError("This browser cannot choose a folder. Exports go to its download folder.");
  }

  let chosen: FileSystemDirectoryHandle;
  try {
    chosen = await window.showDirectoryPicker!({
      id: "definition-capture-exports",
      mode: "readwrite",
      startIn: "documents",
    });
  } catch (cause) {
    // The picker throws AbortError when it is closed without choosing.
    if (cause instanceof DOMException && cause.name === "AbortError") return false;
    throw new ExportFolderError("The folder could not be opened. Please try again.");
  }

  handle = chosen;
  await writeStored(chosen);
  publish({ name: chosen.name, loaded: true });
  return true;
}

/** Back to the browser's download folder. */
export async function clearExportFolder(): Promise<void> {
  handle = null;
  await writeStored(null);
  publish({ name: null, loaded: true });
}

/* ----------------------------------------------------------------- writing */

async function ensurePermission(target: FileSystemDirectoryHandle): Promise<boolean> {
  // Both methods are optional: a browser with the picker but without them is
  // treated as already permitted, since it has no way to say otherwise.
  const query = await target.queryPermission?.({ mode: "readwrite" });
  if (query === undefined || query === "granted") return true;

  const request = await target.requestPermission?.({ mode: "readwrite" });
  return request === undefined || request === "granted";
}

function describe(cause: unknown, folder: string): string {
  const name = cause instanceof DOMException ? cause.name : "";
  if (name === "NotFoundError") {
    return `The folder "${folder}" could not be found. It may have been moved, renamed, or deleted.`;
  }
  if (name === "NotAllowedError" || name === "SecurityError") {
    return `Definition Capture is no longer allowed to write to "${folder}".`;
  }
  if (name === "NoModificationAllowedError") {
    return `The file could not be written to "${folder}" — something else may have it open.`;
  }
  return `The export could not be written to "${folder}".`;
}

/**
 * Writes the file into the chosen folder and answers with that folder's name.
 * Null means no folder is configured, which tells the caller to fall back to a
 * normal download; an `ExportFolderError` means a folder *is* configured but
 * unusable, so the caller can say what went wrong and offer another one.
 */
export async function saveToExportFolder(
  blob: Blob,
  fileName: string,
): Promise<string | null> {
  const target = handle;
  if (!target) return null;

  if (!(await ensurePermission(target))) {
    throw new ExportFolderError(
      `Definition Capture is no longer allowed to write to "${target.name}". Choose the folder again to restore access.`,
    );
  }

  try {
    const file = await target.getFileHandle(fileName, { create: true });
    const writable = await file.createWritable();
    await writable.write(blob);
    await writable.close();
    return target.name;
  } catch (cause) {
    throw new ExportFolderError(describe(cause, target.name));
  }
}
