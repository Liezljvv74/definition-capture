import { useRouter } from "next/navigation";
import { useState } from "react";

import { buildDeck, FlashcardError, type DeckRequest } from "@/lib/flashcards";

/**
 * Build a deck and go to it, the one way the deck builder and the dashboard's
 * buttons both do it. `busy` stays on through the navigation, so nothing can
 * be pressed twice on the way out; a failure turns it off and says why.
 */
export function useBuildDeck() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function build(request: DeckRequest) {
    setBusy(true);
    setError(null);
    try {
      const deckId = await buildDeck(request);
      router.push(`/flashcards/?deck=${deckId}`);
    } catch (cause) {
      setBusy(false);
      setError(
        cause instanceof FlashcardError ? cause.message : "The deck could not be built. Please try again.",
      );
    }
  }

  return { busy, error, build };
}
