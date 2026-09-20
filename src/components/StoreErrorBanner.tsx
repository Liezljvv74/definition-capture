"use client";

import { useSyncExternalStore } from "react";

import {
  clearError as clearPhraseError,
  getError as getPhraseError,
  subscribeToError as watchPhraseError,
} from "@/lib/phraseStorage";
import {
  clearError as clearSettingsError,
  getError as getSettingsError,
  subscribeToError as watchSettingsError,
} from "@/lib/settings";
import {
  clearError as clearEntryError,
  getError as getEntryError,
  subscribeToError as watchEntryError,
} from "@/lib/storage";
import {
  clearError as clearVerbError,
  getError as getVerbError,
  subscribeToError as watchVerbError,
} from "@/lib/verbTables";

/** Every store that can fail, in the order their messages are preferred. */
const STORES = [
  { watch: watchEntryError, get: getEntryError, clear: clearEntryError },
  { watch: watchPhraseError, get: getPhraseError, clear: clearPhraseError },
  { watch: watchVerbError, get: getVerbError, clear: clearVerbError },
  { watch: watchSettingsError, get: getSettingsError, clear: clearSettingsError },
];

/** Nothing is stored on the server, so there is never a message to show there. */
const noError = () => null;

/**
 * Says so when a save did not reach the database.
 *
 * Writes are optimistic — the screen updates before the network answers, which
 * is what keeps the app feeling like the localStorage version it grew out of.
 * The price is that a failure arrives after the fact, with the edit already
 * drawn. The store handles that by reloading the list so the screen shows what
 * is really stored; this banner is how the reader finds out that their change
 * was one of the things undone.
 *
 * It watches errors only, through `subscribeToError`, so that mounting it in
 * the workspace layout does not make every page fetch every list. And it
 * watches *all* of them: the conjugation tables were added as a third list and
 * this file was not updated, so for a while a failed table save reverted a
 * whole grid of typed work without a word on screen. Settings is here for the
 * same reason — it is saved from the verbs page and from a table card, neither
 * of which has anywhere to show a failure.
 *
 * A new store is not finished until it appears in `STORES` above.
 */
export function StoreErrorBanner() {
  const message = useSyncExternalStore(
    // Fan one React subscription out to every store. The listener is the same
    // function for all of them, so any publish re-reads the whole list below.
    (listener) => {
      const stop = STORES.map((store) => store.watch(listener));
      return () => stop.forEach((off) => off());
    },
    () => STORES.reduce<string | null>((found, store) => found ?? store.get(), null),
    noError,
  );

  if (!message) return null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
      <div
        role="alert"
        className="card flex items-start gap-3 border-red-200 bg-red-50 p-4 text-sm
          text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
      >
        {/* The whole sentence comes from the store. A read that failed and a
            write that failed need to say different things, and appending one
            fixed ending here told everyone their changes had been undone even
            when nothing had been written at all. */}
        <p className="flex-1">{message}</p>
        <button
          type="button"
          className="btn btn-secondary shrink-0"
          onClick={() => STORES.forEach((store) => store.clear())}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
