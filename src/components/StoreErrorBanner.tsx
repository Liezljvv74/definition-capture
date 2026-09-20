"use client";

import { clearError as clearPhraseError } from "@/lib/phraseStorage";
import { clearError as clearEntryError } from "@/lib/storage";
import { useTerms } from "@/lib/useTerms";
import { usePhrases } from "@/lib/usePhrases";

/**
 * Says so when a save did not reach the database.
 *
 * Writes are optimistic — the screen updates before the network answers, which
 * is what keeps the app feeling like the localStorage version it grew out of.
 * The price is that a failure arrives after the fact, with the edit already
 * drawn. The store handles that by reloading the list so the screen shows what
 * is really stored; this banner is how the reader finds out that their change
 * was one of the things undone.
 */
export function StoreErrorBanner() {
  const { error: entryError } = useTerms();
  const { error: phraseError } = usePhrases();

  const message = entryError ?? phraseError;
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
          onClick={() => {
            clearEntryError();
            clearPhraseError();
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
