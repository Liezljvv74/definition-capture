"use client";

import { useState } from "react";

import { Modal } from "@/components/Modal";
import { PhraseForm } from "@/components/PhraseForm";
import { createPhrase, findByPhrase, updatePhrase } from "@/lib/phraseStorage";
import { EMPTY_PHRASE_INPUT, type Phrase, type PhraseInput } from "@/lib/types";

export function AddPhraseDialog({ onClose }: { onClose: () => void }) {
  /** The saved phrase a new one collided with, if the reader hit one. */
  const [duplicate, setDuplicate] = useState<Phrase | null>(null);
  /** The saved phrase being edited, once the reader has chosen to edit it. */
  const [editing, setEditing] = useState<Phrase | null>(null);
  // The prompt below replaces the form rather than sitting on top of it, so
  // the form unmounts and its state goes with it. Holding the draft here
  // means “Back to editing” returns the words that were typed, not a blank
  // form — which is what it used to do.
  const [draft, setDraft] = useState<PhraseInput>(EMPTY_PHRASE_INPUT);

  function handleSubmit(input: PhraseInput) {
    const existing = findByPhrase(input.phrase);
    if (existing) {
      // Never silently duplicate — ask what the user meant.
      setDraft(input);
      setDuplicate(existing);
      return;
    }
    createPhrase(input);
    onClose();
  }

  if (editing) {
    return (
      <Modal title={`Edit ${editing.phrase}`} onClose={onClose}>
        {/* Shown rather than applied: updating used to overwrite this
            phrase with what was typed, sight unseen. */}
        {draft.literalMeaning.trim() &&
          draft.literalMeaning.trim() !== editing.literalMeaning && (
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/50">
              <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                What you just typed
              </p>
              <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                {draft.literalMeaning.trim()}
              </p>
            </div>
          )}
        <PhraseForm
          initialValue={{
            phrase: editing.phrase,
            literalMeaning: editing.literalMeaning,
            usageExample: editing.usageExample,
            ref: editing.ref,
          }}
          submitLabel="Save changes"
          onSubmit={(input) => {
            updatePhrase(editing.id, input);
            onClose();
          }}
          onCancel={onClose}
          autoFocus
        />
      </Modal>
    );
  }

  // Saved once, for the same reasons as a term: the unique index refuses a
  // second, and a `[[Name]]` link resolves to exactly one phrase.
  if (duplicate) {
    const existing = duplicate;
    return (
      <Modal title="That phrase is already saved" onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            You already saved <strong className="font-semibold">{existing.phrase}</strong>.
            Open it to edit, or go back and change the wording?
          </p>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/50">
            <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Existing phrase
            </p>
            <p className="whitespace-pre-wrap">
              {existing.literalMeaning || (
                <span className="text-slate-400 italic dark:text-slate-500">
                  No literal meaning yet
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setEditing(existing)}
            >
              Open it for editing
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDuplicate(null)}
            >
              Back to editing
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add a phrase" onClose={onClose}>
      <PhraseForm
        initialValue={draft}
        submitLabel="Save phrase"
        onSubmit={handleSubmit}
        onCancel={onClose}
        autoFocus
      />
    </Modal>
  );
}
