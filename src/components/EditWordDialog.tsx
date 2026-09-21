"use client";

import { useState } from "react";

import { EntryForm } from "@/components/EntryForm";
import { Modal } from "@/components/Modal";
import { findByWord, updateEntry } from "@/lib/storage";
import type { Entry, EntryInput } from "@/lib/types";

/**
 * Edits a word without leaving the list — the counterpart to
 * `AddWordDialog`, and the twin of `EditPhraseDialog`.
 *
 * Every editable field lives in this one form, Source included. There is no
 * second screen for changing a single attribute, and saving drops you straight
 * back on the word list.
 */
export function EditWordDialog({
  entry,
  onClose,
  onSaved,
}: {
  entry: Entry;
  onClose: () => void;
  /**
   * Runs instead of `onClose` once a save goes through. The list pages just
   * close the dialog; a detail page uses this to send the user back to the
   * list, so saving always lands on the list wherever the form was opened.
   */
  onSaved?: () => void;
}) {
  /** Set when the new wording collides with a *different* saved word. */
  const [clash, setClash] = useState<Entry | null>(null);
  // The clash screen replaces the form rather than sitting on top of it, so
  // the form unmounts and its state goes with it. Holding the draft here
  // means “Back to editing” returns the rename in progress, rather than
  // reverting to what is saved — which is what it used to do.
  const [draft, setDraft] = useState<EntryInput>({
    word: entry.word,
    definition: entry.definition,
    ref: entry.ref,
    categories: entry.categories,
    source: entry.source,
  });

  function handleSubmit(input: EntryInput) {
    const existing = findByWord(input.word, entry.id);
    if (existing) {
      // Renaming onto another word would leave two identical entries.
      setDraft(input);
      setClash(existing);
      return;
    }
    updateEntry(entry.id, input);
    (onSaved ?? onClose)();
  }

  if (clash) {
    return (
      <Modal title="Another word already has that name" onClose={onClose}>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <strong className="font-semibold">{clash.word}</strong> is already saved separately.
          Change the wording, or delete one of the two from your word list.
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
    <Modal title="Edit word" onClose={onClose}>
      <EntryForm
        initialValue={draft}
        submitLabel="Save changes"
        verbTableFor={entry.word}
        onSubmit={handleSubmit}
        onCancel={onClose}
        autoFocus
      />
    </Modal>
  );
}
