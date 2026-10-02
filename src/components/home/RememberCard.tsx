"use client";

import { useState } from "react";

import { cardBack } from "@/lib/flashcards";
import type { RememberItem } from "@/lib/home";

/**
 * One saved word or phrase; the word itself is the button that reveals its
 * meaning. A disclosure rather than a flashcard: nothing is recorded, so it
 * costs the reader nothing to peek. The control is the word, not a separate
 * button, so the card carries no helper text; the visually hidden suffix is
 * what tells a screen reader what pressing it does.
 */
export function RememberCard({ item, className = "" }: { item: RememberItem; className?: string }) {
  const [shown, setShown] = useState(false);
  const meaningId = `remember-${item.id}`;

  return (
    <section aria-labelledby="remember-heading" className={`card p-6 ${className}`}>
      <h2 id="remember-heading" className="text-xs font-semibold tracking-wider text-slate-600 uppercase dark:text-slate-400">
        Do you still remember this one?
      </h2>
      <button
        type="button"
        aria-expanded={shown}
        aria-controls={meaningId}
        className="mt-3 cursor-pointer text-left text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        onClick={() => setShown(!shown)}
      >
        {item.title}
        <span className="sr-only"> {shown ? "Hide meaning" : "Show meaning"}</span>
      </button>
      {/* Always rendered, hidden while collapsed, so aria-controls resolves. */}
      <p id={meaningId} hidden={!shown} className="mt-3 text-sm leading-6 whitespace-pre-line text-slate-700 dark:text-slate-300">
        {cardBack(item)}
      </p>
    </section>
  );
}
