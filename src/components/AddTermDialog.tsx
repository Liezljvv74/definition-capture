"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { EntryForm } from "@/components/EntryForm";
import { SourceBadge } from "@/components/Badges";
import { Modal } from "@/components/Modal";
import { formatDate } from "@/lib/format";
import { createEntry, findByTerm, updateEntry } from "@/lib/storage";
import type { Entry, EntryInput } from "@/lib/types";

type DuplicatePrompt = { existing: Entry; input: EntryInput };

export function AddTermDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [duplicate, setDuplicate] = useState<DuplicatePrompt | null>(null);

  function handleSubmit(input: EntryInput) {
    const existing = findByTerm(input.term);
    if (existing) {
      // Never silently duplicate — ask what the user meant.
      setDuplicate({ existing, input });
      return;
    }
    createEntry(input);
    onClose();
  }

  if (duplicate) {
    const { existing, input } = duplicate;
    return (
      <Modal title="That term is already in your glossary" onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            You already saved <strong className="font-semibold">{existing.term}</strong>. Do you
            want to update that entry, or keep both?
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
                router.push(`/terms/${existing.id}`);
              }}
            >
              Update the existing entry
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                createEntry(input);
                onClose();
              }}
            >
              Save as a separate new entry
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
      <EntryForm submitLabel="Save term" onSubmit={handleSubmit} onCancel={onClose} autoSplit autoFocus />
    </Modal>
  );
}
