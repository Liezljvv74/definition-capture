"use client";

import { useSyncExternalStore } from "react";

import { getServerSnapshot, getSnapshot, subscribe } from "@/lib/grammarRules";
import type { GrammarRule } from "@/lib/types";

/** The grammar rules, read the same way the other three lists are. */
export function useGrammarRules(): {
  rules: GrammarRule[];
  loaded: boolean;
  error: string | null;
} {
  const { items, loaded, error } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return { rules: items, loaded, error };
}
