"use client";

import { useSyncExternalStore } from "react";

import { getServerSnapshot, getSnapshot, subscribe } from "@/lib/phraseStorage";
import type { Phrase } from "@/lib/types";

/** The phrase list's counterpart to `useGlossary`. */
export function usePhrases(): { phrases: Phrase[]; loaded: boolean } {
  const { items, loaded } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return { phrases: items, loaded };
}
