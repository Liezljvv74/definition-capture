"use client";

import { useSyncExternalStore } from "react";

import {
  getServerSnapshot,
  getSnapshot,
  subscribe,
  type SessionSnapshot,
} from "@/lib/session";

/**
 * Who is signed in. `loaded` is false until Supabase has finished looking for
 * a saved session — render nothing account-shaped until it is true, or the
 * sign-in screen will flash in front of a reader who is already signed in.
 */
export function useSession(): SessionSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
