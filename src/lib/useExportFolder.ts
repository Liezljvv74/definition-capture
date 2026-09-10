"use client";

import { useSyncExternalStore } from "react";

import {
  getServerSnapshot,
  getSnapshot,
  subscribe,
  type ExportFolderSnapshot,
} from "@/lib/exportFolder";

/**
 * The chosen export folder, read the same way the lists are. `loaded` is false
 * during the server render and until IndexedDB has answered, which is what
 * keeps Settings from flashing "browser's download folder" at someone who has
 * chosen one.
 */
export function useExportFolder(): ExportFolderSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
