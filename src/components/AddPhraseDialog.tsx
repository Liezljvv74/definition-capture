"use client";

import { useState } from "react";

import { Modal } from "@/components/Modal";
import { PhraseForm } from "@/components/PhraseForm";
import { createPhrase, findByPhrase, updatePhrase } from "@/lib/phraseStorage";
import type { Phrase, PhraseInput } from "@/lib/types";

type DuplicatePrompt = { existing: Phrase; input: PhraseInput };

export function AddPhraseDialog({ onClose }: { onClose: () => void }) {
  const [duplicate, setDuplicate] = useState<DuplicatePrompt | null>(null);

  function handleSubmit(input: PhraseInput) {
    const existing = findByPhrase(input.phrase);
    if (existing) {
      // Never silently duplicate — ask what the user meant.
      setDuplicate({ existing, input });
      return;
    }
    createPhrase(input);
    onClose();
  }

  if (duplicate) {
    const { existing, input } = duplicate;
    return (
      <Modal title="That phrase is already saved" onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            You already saved <strong className="font-semibold">{existing.phrase}</strong>. Do
            you want to update that one, or keep both?
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
              onClick={() => {
                updatePhrase(existing.id, input);
                onClose();
              }}
            >
              Update the existing phrase
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                createPhrase(input);
                onClose();
              }}
            >
              Save as a separate new phrase
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
      <PhraseForm submitLabel="Save phrase" onSubmit={handleSubmit} onCancel={onClose} autoFocus />
    </Modal>
  );
}
