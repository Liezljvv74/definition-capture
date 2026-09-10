/**
 * The parts of the File System Access API that TypeScript's DOM library does
 * not describe yet. `FileSystemDirectoryHandle` and the writable stream are
 * already in `lib.dom`; the directory picker and the permission methods are
 * not, and both are optional at runtime — Firefox and Safari have neither.
 * They are declared optional here too, so the code has to check before it
 * calls, which is exactly what it must do anyway.
 */

type FileSystemPermissionMode = "read" | "readwrite";

interface FileSystemHandlePermissionDescriptor {
  mode?: FileSystemPermissionMode;
}

interface FileSystemHandle {
  queryPermission?(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>;
  requestPermission?(
    descriptor?: FileSystemHandlePermissionDescriptor,
  ): Promise<PermissionState>;
}

interface DirectoryPickerOptions {
  /** Groups picker sessions, so the dialog reopens where it last was. */
  id?: string;
  mode?: FileSystemPermissionMode;
  startIn?:
    | FileSystemHandle
    | "desktop"
    | "documents"
    | "downloads"
    | "music"
    | "pictures"
    | "videos";
}

interface Window {
  showDirectoryPicker?(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
}
