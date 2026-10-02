"use client";

import { useState } from "react";

import { cardBack } from "@/lib/flashcards";
import type { RememberItem } from "@/lib/home";

/**
 * One saved word or phrase, its meaning behind a button. A disclosure rather
 * than a flashcard: nothing is recorded, so it costs the reader nothing to
 * peek.
 */
export function RememberCard({ item, className = "" }: { item: RememberItem; className?: string }) {
  const [shown, setShown] = useState(false);
  const meaningId = `remember-${item.id}`;

  return (
    <section aria-labelledby="remember-heading" className={`card p-6 ${className}`}>
      <p id="remember-heading" className="text-xs font-semibold tracking-wider text-slate-600 uppercase dark:text-slate-400">
        Do you still remember this one?
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{item.title}</p>
      {shown ? (
        <p id={meaningId} className="mt-3 text-sm leading-6 whitespace-pre-line text-slate-700 dark:text-slate-300">
          {cardBack(item)}
        </p>
      ) : (
        <button
          type="button"
          aria-expanded={false}
          aria-controls={meaningId}
          className="btn btn-secondary mt-4 rounded-full"
          onClick={() => setShown(true)}
        >
          Show meaning
        </button>
      )}
    </section>
  );
}
