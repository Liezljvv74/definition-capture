"use client";

import { useState } from "react";

import { CreateDeckDialog } from "@/components/flashcards/CreateDeckDialog";

/**
 * The dashboard's "Customise deck" link-style button, which opens the deck
 * builder, and nothing else.
 *
 * It exists so the page around it does not have to be a client component. The
 * seam is put at the smallest thing that genuinely needs state.
 *
 * `CreateDeckDialog` is imported normally rather than lazily: it pulls in
 * `@/lib/flashcards` and nothing else, so it costs a small module rather than
 * the word and phrase stores.
 */
export function CreateDeckButton({ className = "" }: { className?: string }) {
  const [creating, setCreating] = useState(false);

  return (
    <>
      <button
        type="button"
        className={`text-sm font-medium text-indigo-900 underline underline-offset-2 hover:text-indigo-700 dark:text-indigo-200 ${className}`}
        onClick={() => setCreating(true)}
      >
        Customise deck
      </button>

      {creating && <CreateDeckDialog onClose={() => setCreating(false)} />}
    </>
  );
}
