"use client";

import { useSyncExternalStore } from "react";

/**
 * Tailwind's `md`. Kept as one string so the query and the classes it stands
 * in for cannot drift apart.
 */
const WIDE = "(min-width: 768px)";

function subscribe(listener: () => void): () => void {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

/**
 * True on a desktop-width viewport, false on a narrow one, and **null until
 * the answer is known** — which is the whole reason this exists rather than a
 * plain `useState` + effect.
 *
 * The two list pages each render a table and a card list, with CSS hiding one
 * of them. That means every row is built, reconciled and held in the DOM
 * twice, and every keystroke in the search box re-renders both halves. At a
 * few hundred words that is thousands of nodes of pure waste.
 *
 * Picking one in JavaScript instead would normally trade that for a flash:
 * the server has no viewport, so it has to guess, and a phone would draw the
 * desktop table for a frame before correcting itself. The `null` avoids the
 * trade. While the answer is unknown — during the server render and the first
 * client render that hydrates it — callers fall back to rendering both and
 * letting CSS choose, exactly as before. The moment the browser answers, they
 * switch to one. First paint is byte-identical to the old behaviour; every
 * render after it does half the work.
 */
export function useWideScreen(): boolean | null {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(WIDE).matches,
    // No viewport on the server, and no honest guess to make about one.
    () => null,
  );
}
