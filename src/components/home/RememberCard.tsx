"use client";

import { cardBack } from "@/lib/flashcards";
import type { RememberItem } from "@/lib/home";

/**
 * One saved word or phrase; the word itself is the summary that reveals its
 * meaning. A disclosure rather than a flashcard: nothing is recorded, so it
 * costs the reader nothing to peek. A native `<details>` carries the expanded
 * state to screen readers itself; the visually hidden suffix only says what
 * opening it shows, since the card carries no helper text.
 */
export function RememberCard({ item }: { item: RememberItem }) {
  return (
    <section aria-labelledby="remember-heading" className="relative tape tape-pink rounded-[4px] border-[1.5px] border-dashed border-ink-soft bg-card p-4 shadow-[2px_3px_8px_rgb(0_0_0/0.18)]">
      <h2 id="remember-heading" className="text-sm font-semibold tracking-wider text-ink-soft uppercase">
        Do you still remember this one?
      </h2>
      <details>
        {/* Block rather than list-item, and Safari's marker hidden, so it has no triangle, as the button it replaced had none. */}
        <summary className="mt-2 block w-fit cursor-pointer text-left hand-title text-xl [overflow-wrap:anywhere] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
          {item.title}
          <span className="sr-only"> meaning</span>
        </summary>
        <p className="mt-2 text-sm leading-6 whitespace-pre-line text-ink-soft">{cardBack(item)}</p>
      </details>
    </section>
  );
}
