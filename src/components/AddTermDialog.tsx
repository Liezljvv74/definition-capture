"use client";

import { useState } from "react";

import { EntryForm } from "@/components/EntryForm";
import { SourceBadge } from "@/components/Badges";
import { Modal } from "@/components/Modal";
import { formatDate } from "@/lib/format";
import { createEntry, findByTerm, updateEntry } from "@/lib/storage";
import { EMPTY_ENTRY_INPUT, type Entry, type EntryInput } from "@/lib/types";

type DuplicatePrompt = { existing: Entry; input: EntryInput };

export function AddTermDialog({ onClose }: { onClose: () => void }) {
  const [duplicate, setDuplicate] = useState<DuplicatePrompt | null>(null);
  // The prompt below replaces the form rather than sitting on top of it, so
  // the form unmounts and its state goes with it. Holding the draft here
  // means “Back to editing” returns the words that were typed, not a blank
  // form — which is what it used to do.
  const [draft, setDraft] = useState<EntryInput>(EMPTY_ENTRY_INPUT);

  function handleSubmit(input: EntryInput) {
    const existing = findByTerm(input.term);
    if (existing) {
      // Never silently duplicate — ask what the user meant.
      setDraft(input);
      setDuplicate({ existing, input });
      return;
    }
    createEntry(input);
    onClose();
  }

  // A term is saved once. The unique index on (user_id, lower(term)) refuses
  // a second one outright, and `[[Name]]` links, this duplicate check, and
  // import matching all resolve a name to exactly one entry — so there is no
  // “keep both” on offer here. Offering it meant drawing a row optimistically
  // and watching the database take it away again.
  if (duplicate) {
    const { existing, input } = duplicate;
    return (
      <Modal title="That term is already saved" onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            You already saved <strong className="font-semibold">{existing.term}</strong>. Do you
            want to update it?
          </p>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/50">
            <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Existing entry · added {formatDate(existing.dateAdded)}
            </p>
            <p className="mb-2 whitespace-pre-wrap">
              {existing.definition || (
                <span className="text-slate-400 italic dark:text-slate-500">
                  No definition yet
                </span>
              )}
            </p>
            <SourceBadge source={existing.source} />
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                updateEntry(existing.id, input);
                onClose();
              }}
            >
              Update the existing entry
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
    <Modal title="Add a term" onClose={onClose}>
      <EntryForm
        initialValue={draft}
        submitLabel="Save term"
        onSubmit={handleSubmit}
        onCancel={onClose}
        autoSplit
        autoFocus
      />
    </Modal>
  );
}
