"use client";

import { useState } from "react";

import {
  forgetLegacyData,
  LEGACY_ENTRIES_KEY,
  LEGACY_PHRASES_KEY,
  readLegacyList,
} from "@/lib/legacyLocal";
import { importPhrases, parsePhrase } from "@/lib/phraseStorage";
import { importEntries, parseEntry } from "@/lib/storage";
import { useTerms } from "@/lib/useTerms";
import { usePhrases } from "@/lib/usePhrases";

/**
 * Offers the pre-account term list — the one still sitting in this browser's
 * `localStorage` — to the signed-in account.
 *
 * Deliberately two steps. The copy is one write, and dropping the old keys is
 * another; doing both at once would mean deleting the only copy of the data on
 * the strength of a request whose outcome has not been seen yet. So the import
 * runs first, and the old copy is only removed once the reader has looked at
 * their list and pressed the second button.
 */
export function ImportLocalPrompt() {
  // Read once, on mount, rather than on every render: this is synchronous
  // localStorage work and the answer cannot change underneath us.
  const [legacy] = useState(() => {
    if (typeof window === "undefined") return { entries: [], phrases: [] };
    return {
      entries: readLegacyList(LEGACY_ENTRIES_KEY, (raw) => parseEntry(raw, true)),
      phrases: readLegacyList(LEGACY_PHRASES_KEY, (raw) => parsePhrase(raw, true)),
    };
  });

  const [step, setStep] = useState<"offer" | "copied" | "gone">("offer");
  const [copied, setCopied] = useState({ terms: 0, phrases: 0, skipped: 0 });

  const terms = useTerms();
  const phraseList = usePhrases();
  // Both lists have to be fetched before importing: the "already have this
  // one" check runs against them, and a duplicate term would be rejected by
  // the database's unique index rather than quietly merged.
  const ready = terms.loaded && phraseList.loaded;

  const total = legacy.entries.length + legacy.phrases.length;
  if (total === 0 || step === "gone") return null;

  function handleCopy() {
    // "skip" so running this twice, or on a browser whose terms are already in
    // the account, cannot overwrite anything that has since been edited.
    const terms = importEntries(legacy.entries, "skip");
    const phrases = importPhrases(legacy.phrases, "skip");
    setCopied({
      terms: terms.added,
      phrases: phrases.added,
      skipped: terms.skipped + phrases.skipped,
    });
    setStep("copied");
  }

  function handleForget() {
    forgetLegacyData();
    setStep("gone");
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
      <div className="card border-indigo-200 bg-indigo-50 p-4 text-sm dark:border-indigo-900 dark:bg-indigo-950/40">
        {step === "offer" ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>
              This browser still holds {describe(legacy.entries.length, legacy.phrases.length)}{" "}
              saved before you had an account. Copy them into your term list?
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCopy}
                disabled={!ready}
              >
                {ready ? "Copy them in" : "Loading…"}
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleForget}>
                Discard
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Copied {describe(copied.terms, copied.phrases)} into your account
              {copied.skipped > 0 &&
                `, and left ${copied.skipped} alone because you already had them`}
              . The old browser copy is still here until you remove it.
            </p>
            <button
              type="button"
              className="btn btn-secondary shrink-0"
              onClick={handleForget}
            >
              Remove the old copy
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** "3 terms and 1 phrase", with only the halves that are actually there. */
function describe(terms: number, phrases: number): string {
  const parts: string[] = [];
  if (terms > 0) parts.push(`${terms} ${terms === 1 ? "term" : "terms"}`);
  if (phrases > 0) parts.push(`${phrases} ${phrases === 1 ? "phrase" : "phrases"}`);
  if (parts.length === 0) return "nothing";
  return parts.join(" and ");
}
