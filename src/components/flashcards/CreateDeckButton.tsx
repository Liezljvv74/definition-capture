"use client";

import { useState } from "react";

import { CreateDeckDialog } from "@/components/flashcards/CreateDeckDialog";

/**
 * The button on the home page that opens the deck builder, and nothing else.
 *
 * It exists so the page around it does not have to be a client component. The
 * whole landing page was marked `"use client"` to hold this one boolean, which
 * meant every word of static prose on it shipped as JavaScript and hydrated in
 * the browser for the sake of a dialog most visits never open. The seam is put
 * at the smallest thing that genuinely needs state.
 *
 * `CreateDeckDialog` is imported normally rather than lazily: it pulls in
 * `@/lib/flashcards` and nothing else, so it costs a small module rather than
 * the word and phrase stores.
 */
export function CreateDeckButton() {
  const [creating, setCreating] = useState(false);

  return (
    <>
      <button type="button" className="btn btn-primary mt-4" onClick={() => setCreating(true)}>
        Create flashcards
      </button>

      {creating && <CreateDeckDialog onClose={() => setCreating(false)} />}
    </>
  );
}
