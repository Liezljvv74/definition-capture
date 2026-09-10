"use client";

import { useSyncExternalStore } from "react";

import { getServerSnapshot, getSnapshot, subscribe } from "@/lib/storage";
import type { Entry } from "@/lib/types";

/**
 * Reads the glossary through React's external-store API so every component
 * re-renders when an entry is added, edited, or deleted. `loaded` is false
 * during the server render, the hydration pass, and the first fetch from
 * Supabase, which is what keeps the empty state from flashing.
 *
 * `error` is set when a write could not reach the database; the list has been
 * reloaded to match what is really stored, so showing it is the only thing
 * left to do.
 */
export function useGlossary(): { entries: Entry[]; loaded: boolean; error: string | null } {
  const { items, loaded, error } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return { entries: items, loaded, error };
}
