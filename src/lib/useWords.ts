"use client";

import { useSyncExternalStore } from "react";

import { getServerSnapshot, getSnapshot, subscribe } from "@/lib/storage";
import type { Entry } from "@/lib/types";

/**
 * Reads the word list through React's external-store API so every component
 * re-renders when an entry is added, edited, or deleted. `loaded` is false
 * during the server render, the hydration pass, and the first fetch from
 * Supabase, which is what keeps the empty state from flashing.
 *
 * `error` is set when a read or a write could not reach the database. It is a
 * complete sentence, already saying which of the two happened and what became
 * of the reader's changes, so showing it is the only thing left to do.
 */
export function useWords(): { entries: Entry[]; loaded: boolean; error: string | null } {
  const { items, loaded, error } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return { entries: items, loaded, error };
}
