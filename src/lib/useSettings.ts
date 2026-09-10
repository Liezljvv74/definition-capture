"use client";

import { useSyncExternalStore } from "react";

import {
  getServerSnapshot,
  getSnapshot,
  subscribe,
  type SettingsSnapshot,
} from "@/lib/settings";

/**
 * The account's settings, read the same way the lists are. Falls back to the
 * defaults in `constants.ts` while loading and for an account that has never
 * changed anything, so a form never has an empty dropdown to offer.
 */
export function useSettings(): SettingsSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
