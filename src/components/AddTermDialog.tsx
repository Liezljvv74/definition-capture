"use client";

import { useState } from "react";

import { EntryForm } from "@/components/EntryForm";
import { SourceBadge } from "@/components/Badges";
import { Modal } from "@/components/Modal";
import { formatDate } from "@/lib/format";
import { createEntry, findByTerm, updateEntry } from "@/lib/storage";
import { EMPTY_ENTRY_INPUT, type Entry, type EntryInput } from "@/lib/types";

export function AddTermDialog({ onClose }: { onClose: () => void }) {
  /** The saved entry a new one collided with, if the reader hit one. */
  const [duplicate, setDuplicate] = useState<Entry | null>(null);
  // The prompt below replaces the form rather than sitting on top of it, so
  // the form unmounts and its state goes with it. Holding the draft here
  // means “Back to editing” returns the words that were typed, not a blank
  // form — which is what it used to do.
  const [draft, setDraft] = useState<EntryInput>(EMPTY_ENTRY_INPUT);
  /** The saved entry being edited, once the reader has chosen to edit it. */
  const [editing, setEditing] = useState<Entry | null>(null);

  function handleSubmit(input: EntryInput) {
    const existing = findByTerm(input.term);
    if (existing) {
      // Never silently duplicate — ask what the user meant.
      setDraft(input);
      setDuplicate(existing);
      return;
    }
    createEntry(input);
    onClose();
  }

  if (editing) {
    return (
      <Modal title={`Edit ${editing.term}`} onClose={onClose}>
        {/* What was typed on the add form is shown rather than applied.
            Updating used to mean overwriting this entry with it sight
            unseen, which is not a decision the reader had made — they had
            only said “yes, that one”. Here it is theirs to copy across, or
            ignore. */}
        {draft.definition.trim() && draft.definition.trim() !== editing.definition && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/50">
            <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              What you just typed
            </p>
            <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">
              {draft.definition.trim()}
            </p>
          </div>
        )}
        <EntryForm
          initialValue={{
            term: editing.term,
            definition: editing.definition,
            ref: editing.ref,
            categories: editing.categories,
            source: editing.source,
          }}
          submitLabel="Save changes"
          onSubmit={(input) => {
            updateEntry(editing.id, input);
            onClose();
          }}
          onCancel={onClose}
          autoFocus
        />
      </Modal>
    );
  }

  // A term is saved once. The unique index on (user_id, lower(term)) refuses
  // a second one outright, and `[[Name]]` links, this duplicate check, and
  // import matching all resolve a name to exactly one entry — so there is no
  // “keep both” on offer here. Offering it meant drawing a row optimistically
  // and watching the database take it away again.
  if (duplicate) {
    const existing = duplicate;
    return (
      <Modal title="That term is already saved" onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            You already saved <strong className="font-semibold">{existing.term}</strong>. Open
            it to edit, or go back and change the wording?
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
