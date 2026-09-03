"use client";

import { useState } from "react";

import { Modal } from "@/components/Modal";
import { PhraseForm } from "@/components/PhraseForm";
import { findByPhrase, updatePhrase } from "@/lib/phraseStorage";
import type { Phrase, PhraseInput } from "@/lib/types";

/**
 * Edits a saved phrase without leaving the list. The phrase detail page shows
 * the same four fields the list row already shows, so making every edit
 * navigate there was a round trip for nothing — this is the counterpart to
 * `AddPhraseDialog`, and the two now work the same way.
 */
export function EditPhraseDialog({
  phrase,
  onClose,
  onSaved,
}: {
  phrase: Phrase;
  onClose: () => void;
  /**
   * Runs instead of `onClose` once a save goes through. The list pages just
   * close the dialog; a detail page uses this to send the user back to the
   * list, so saving always lands on the list wherever the form was opened.
   */
  onSaved?: () => void;
}) {
  /** Set when the new wording collides with a *different* saved phrase. */
  const [clash, setClash] = useState<Phrase | null>(null);

  function handleSubmit(input: PhraseInput) {
    const existing = findByPhrase(input.phrase, phrase.id);
    if (existing) {
      // Renaming onto another phrase would leave two identical entries.
      setClash(existing);
      return;
    }
    updatePhrase(phrase.id, input);
    (onSaved ?? onClose)();
  }

  if (clash) {
    return (
      <Modal title="Another phrase already has that wording" onClose={onClose}>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <strong className="font-semibold">{clash.phrase}</strong> is already saved
          separately. Change the wording, or delete one of the two from the list.
        </p>
        <div className="mt-5 flex justify-end">
          <button type="button" className="btn btn-primary" onClick={() => setClash(null)}>
            Back to editing
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Edit phrase" onClose={onClose}>
      <PhraseForm
        initialValue={{
          phrase: phrase.phrase,
          literalMeaning: phrase.literalMeaning,
          usageExample: phrase.usageExample,
          ref: phrase.ref,
        }}
        submitLabel="Save changes"
        onSubmit={handleSubmit}
        onCancel={onClose}
        autoFocus
      />
    </Modal>
  );
}
