"use client";

import { useSyncExternalStore } from "react";

import {
  getServerSnapshot,
  getSnapshot,
  subscribe,
  type GlossarySnapshot,
} from "@/lib/storage";

/**
 * Reads the glossary through React's external-store API so every component
 * re-renders when an entry is added, edited, or deleted — including from
 * another browser tab. `loaded` is false during the server render and the
 * hydration pass, which is what keeps the empty state from flashing.
 */
export function useGlossary(): GlossarySnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
