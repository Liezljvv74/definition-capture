"use client";

import { useSyncExternalStore } from "react";

import { getServerSnapshot, getSnapshot, subscribe } from "@/lib/rules";
import type { Rule } from "@/lib/types";

/** The grammar rules, read the same way the other lists are. */
export function useRules(): { rules: Rule[]; loaded: boolean; error: string | null } {
  const { items, loaded, error } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { rules: items, loaded, error };
}
