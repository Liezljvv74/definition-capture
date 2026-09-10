"use client";

import { useSyncExternalStore } from "react";

import type { VerbTable } from "@/lib/types";
import { getServerSnapshot, getSnapshot, subscribe } from "@/lib/verbTables";

/** The conjugation tables, read the same way the two lists are. */
export function useVerbTables(): {
  tables: VerbTable[];
  loaded: boolean;
  error: string | null;
} {
  const { items, loaded, error } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return { tables: items, loaded, error };
}
