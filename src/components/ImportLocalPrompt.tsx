"use client";

import { useState } from "react";

import {
  forgetLegacyData,
  LEGACY_ENTRIES_KEY,
  LEGACY_PHRASES_KEY,
  readLegacyList,
} from "@/lib/legacyLocal";
import {
  importPhrases,
  parsePhrase,
  settled as phrasesSettled,
} from "@/lib/phraseStorage";
import { importEntries, parseEntry, settled as termsSettled } from "@/lib/storage";
import type { Entry, Phrase } from "@/lib/types";
import { useTerms } from "@/lib/useTerms";
import { usePhrases } from "@/lib/usePhrases";

/**
 * Offers the pre-account term list — the one still sitting in this browser's
 * `localStorage` — to the signed-in account.
 *
 * This is the last thread back to the browser-only version of the app, and the
 * only place `localStorage` is still read. Everything it copies is on its way
 * to Supabase, where it belongs; once a browser has been through this, the
 * prompt never appears again.
 *
 * Deliberately two steps, and the second one waits. Copying is one write and
 * dropping the old keys is another, and doing both at once would delete the
 * only copy of the data on the strength of a request nobody has seen the
 * answer to. Writes here are optimistic — the list on screen updates before
 * the database replies — so "it looks copied" is not evidence that it is.
 * `settled()` waits for the real answer, and the old copy is only offered for
 * removal once the write has actually landed.
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

  // The store hooks live in the inner component, not here, and that split is
  // the whole point of it. Subscribing to a store is what tells it to fetch,
  // and this prompt is mounted in the workspace layout — so reading the term
  // and phrase lists at this level made every page fetch both, for every
  // reader, to answer a question that only matters to someone migrating off
  // the browser-only version once. Almost nobody has legacy data; those who
  // do not now cost nothing.
  if (legacy.entries.length + legacy.phrases.length === 0) return null;
  return <LegacyOffer legacy={legacy} />;
}

function LegacyOffer({
  legacy,
}: {
  legacy: { entries: Entry[]; phrases: Phrase[] };
}) {
  const [step, setStep] = useState<
    "offer" | "copying" | "copied" | "confirmForget" | "confirmDiscard" | "gone"
  >("offer");
  const [copied, setCopied] = useState({ terms: 0, phrases: 0, skipped: 0 });

  const terms = useTerms();
  const phraseList = usePhrases();
  // Both lists have to be fetched before importing: the "already have this
  // one" check runs against them, and a duplicate term would be rejected by
  // the database's unique index rather than quietly merged.
  const ready = terms.loaded && phraseList.loaded;

  // Whichever store reported a failure, the copy did not fully arrive. The
  // store has already reloaded itself from the database and the banner is
  // saying so; all this needs to do is refuse to delete the other copy.
  const writeFailed = terms.error !== null || phraseList.error !== null;

  if (step === "gone") return null;

  async function handleCopy() {
    setStep("copying");
    // "skip" so running this twice, or on a browser whose terms are already in
    // the account, cannot overwrite anything that has since been edited.
    const termResult = importEntries(legacy.entries, "skip");
    const phraseResult = importPhrases(legacy.phrases, "skip");
    setCopied({
      terms: termResult.added,
      phrases: phraseResult.added,
      skipped: termResult.skipped + phraseResult.skipped,
    });

    // The counts above describe what was asked for. This is where we find out
    // whether it happened.
    await Promise.all([termsSettled(), phrasesSettled()]);
    setStep("copied");
  }

  function handleForget() {
    forgetLegacyData();
    setStep("gone");
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
      <div className="card border-indigo-200 bg-indigo-50 p-4 text-sm dark:border-indigo-900 dark:bg-indigo-950/40">
        {step === "offer" || step === "copying" ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>
              This browser still holds {describe(legacy.entries.length, legacy.phrases.length)}{" "}
              saved before you had an account. Copy them into your word list?
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void handleCopy()}
                disabled={!ready || step === "copying"}
              >
                {step === "copying" ? "Copying…" : ready ? "Copy them in" : "Loading…"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStep("confirmDiscard")}
                disabled={step === "copying"}
              >
                Discard
              </button>
            </div>
          </div>
        ) : step === "confirmDiscard" ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Discarding deletes {describe(legacy.entries.length, legacy.phrases.length)} from
              this browser without copying anything into your account. This cannot be undone.
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStep("offer")}
              >
                Go back
              </button>
              <button type="button" className="btn btn-danger" onClick={handleForget}>
                Yes, discard
              </button>
            </div>
          </div>
        ) : step === "confirmForget" ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Your account now has {describe(copied.terms, copied.phrases)}. Removing the old
              copy deletes it from this browser for good.
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setStep("copied")}
              >
                Go back
              </button>
              <button type="button" className="btn btn-danger" onClick={handleForget}>
                Yes, remove it
              </button>
            </div>
          </div>
        ) : writeFailed ? (
          <div className="flex flex-col gap-3">
            <p>
              The copy did not reach the database, so the browser&rsquo;s copy is being kept.
              Nothing has been deleted. Try again once the message above is sorted out.
            </p>
            <div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setStep("offer")}
              >
                Try again
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
              onClick={() => setStep("confirmForget")}
            >
              Remove the old copy
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** "3 words and 1 phrase", with only the halves that are actually there. */
function describe(terms: number, phrases: number): string {
  const parts: string[] = [];
  if (terms > 0) parts.push(`${terms} ${terms === 1 ? "word" : "words"}`);
  if (phrases > 0) parts.push(`${phrases} ${phrases === 1 ? "phrase" : "phrases"}`);
  if (parts.length === 0) return "nothing";
  return parts.join(" and ");
}
