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
export function ReviewCard({
  state,
  quote,
  className = "",
}: {
  state: ReviewState;
  quote?: { text: string; by: string };
  className?: string;
}) {
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

  const showQuote = quote && (state.kind === "caughtUp" || state.kind === "noCards" || state.kind === "empty");
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
      {showQuote && (
        // A fixed height, so the card is the same size whichever quote the
        // server picked. h-32 holds the longest quote whole at 360px (5 lines
        // of 20px plus the credit); from sm up it is 2 lines (40px) plus the
        // credit (20px) with 8px of slack, so h-[4.25rem]. The clamp matches
        // each height so the credit can never be pushed out.
        <figure className="mt-2 h-32 overflow-hidden sm:h-[4.25rem]">
          <blockquote className="line-clamp-5 text-sm sm:line-clamp-2 leading-5 font-bold italic">
            {`“${quote.text}”`}
          </blockquote>
          <figcaption className="mt-1 text-xs leading-4 font-normal text-slate-600 not-italic">{quote.by}</figcaption>
        </figure>
      )}
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
