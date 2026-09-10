"use client";

import { useSyncExternalStore } from "react";

import { getServerSnapshot, getSnapshot, subscribe } from "@/lib/phraseStorage";
import type { Phrase } from "@/lib/types";

/** The phrase list's counterpart to `useGlossary`. */
export function usePhrases(): { phrases: Phrase[]; loaded: boolean; error: string | null } {
  const { items, loaded, error } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return { phrases: items, loaded, error };
}
