"use client";

import { useState } from "react";

import { EntryForm } from "@/components/EntryForm";
import { Modal } from "@/components/Modal";
import { findByTerm, updateEntry } from "@/lib/storage";
import type { Entry, EntryInput } from "@/lib/types";

/**
 * Edits a glossary entry without leaving the list — the counterpart to
 * `AddTermDialog`, and the twin of `EditPhraseDialog`.
 *
 * Every editable field lives in this one form, Source included. There is no
 * second screen for changing a single attribute, and saving drops you straight
 * back on the glossary.
 */
export function EditTermDialog({
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
  /** Set when the new wording collides with a *different* saved term. */
  const [clash, setClash] = useState<Entry | null>(null);

  function handleSubmit(input: EntryInput) {
    const existing = findByTerm(input.term, entry.id);
    if (existing) {
      // Renaming onto another term would leave two identical entries.
      setClash(existing);
      return;
    }
    updateEntry(entry.id, input);
    (onSaved ?? onClose)();
  }

  if (clash) {
    return (
      <Modal title="Another term already has that name" onClose={onClose}>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <strong className="font-semibold">{clash.term}</strong> is already saved separately.
          Change the wording, or delete one of the two from the glossary.
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
    <Modal title="Edit term" onClose={onClose}>
      <EntryForm
        initialValue={{
          term: entry.term,
          definition: entry.definition,
          ref: entry.ref,
          source: entry.source,
        }}
        submitLabel="Save changes"
        onSubmit={handleSubmit}
        onCancel={onClose}
        autoFocus
      />
    </Modal>
  );
}
