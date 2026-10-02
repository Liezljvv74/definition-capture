"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CreateDeckButton } from "@/components/flashcards/CreateDeckButton";
import { buildDeck, FlashcardError } from "@/lib/flashcards";
import { plural, type ReviewState } from "@/lib/home";

/**
 * The dashboard's main card: what to do now. It is never hidden; on an empty
 * account it becomes the way in.
 *
 * A client component only for the two buttons, which build a deck and go to
 * it exactly as `CreateDeckDialog` does, including how a failure is reported.
 */
export function ReviewCard({ state, className = "" }: { state: ReviewState; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function play(dueOnly: boolean) {
    setBusy(true);
    setError(null);
    try {
      const deckId = await buildDeck({
        sources: ["all"],
        collectionIds: [],
        needsReviewOnly: false,
        size: null,
        dueOnly,
      });
      router.push(`/flashcards/?deck=${deckId}`);
    } catch (cause) {
      setBusy(false);
      setError(
        cause instanceof FlashcardError ? cause.message : "The deck could not be built. Please try again.",
      );
    }
  }

  let heading: string;
  let action: React.ReactNode = null;

  switch (state.kind) {
    case "due":
      heading = `${plural(state.count, "item needs", "items need")} reviewing`;
      action = (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => play(true)}>
          {busy ? "Building your deck…" : "Review now"}
        </button>
      );
      break;
    case "new":
      heading = `Nothing due. ${plural(state.count, "new item", "new items")} to learn`;
      action = (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => play(false)}>
          {busy ? "Building your deck…" : "Learn new items"}
        </button>
      );
      break;
    case "caughtUp":
      heading = state.next ? `All caught up. Next review ${state.next}` : "All caught up";
      break;
    case "noCards":
      heading = "Nothing to review yet";
      action = (
        <Link href="/vocabulary" className="btn btn-primary">
          Add a definition
        </Link>
      );
      break;
    case "empty":
      heading = "Capture your first word";
      action = (
        <Link href="/vocabulary" className="btn btn-primary">
          Go to Vocabulary
        </Link>
      );
      break;
  }

  const canCustomise = state.kind === "due" || state.kind === "new" || state.kind === "caughtUp";

  return (
    <section
      aria-labelledby="review-heading"
      className={`rounded-2xl border border-indigo-100 bg-challenge p-5 text-slate-900 ${className}`}
    >
      <p className="text-xs font-semibold tracking-wider text-slate-600 uppercase">Ready for review</p>
      <h2 id="review-heading" className="mt-1.5 text-xl font-semibold tracking-tight sm:text-2xl">
        {heading}
      </h2>
      {(action || canCustomise) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          {action}
          {canCustomise && <CreateDeckButton />}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
