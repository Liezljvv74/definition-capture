"use client";

import { useState } from "react";

import { GrammarRuleForm } from "@/components/GrammarRuleForm";
import { Modal } from "@/components/Modal";
import {
  createGrammarRule,
  findByTitle,
  updateGrammarRule,
} from "@/lib/grammarRules";
import {
  EMPTY_GRAMMAR_RULE_INPUT,
  type GrammarRule,
  type GrammarRuleInput,
} from "@/lib/types";

export function AddGrammarRuleDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  /** The saved rule a new one collided with, if the reader hit one. */
  const [duplicate, setDuplicate] = useState<GrammarRule | null>(null);
  /** The saved rule being edited, once the reader has chosen to edit it. */
  const [editing, setEditing] = useState<GrammarRule | null>(null);
  // The prompt below replaces the form rather than sitting on top of it, so
  // the form unmounts and its state goes with it. Holding the draft here
  // means "Back to editing" returns the words that were typed.
  const [draft, setDraft] = useState<GrammarRuleInput>(EMPTY_GRAMMAR_RULE_INPUT);

  function handleSubmit(input: GrammarRuleInput) {
    const existing = findByTitle(input.title);
    if (existing) {
      // Never silently duplicate — ask what the reader meant. The unique
      // index would refuse the second one anyway, after the optimistic write
      // had already drawn it.
      setDraft(input);
      setDuplicate(existing);
      return;
    }
    createGrammarRule(input);
    onClose();
  }

  if (editing) {
    return (
      <Modal title={`Edit ${editing.title}`} onClose={onClose}>
        {/* Shown rather than applied: the explanation just typed is not
            silently written over the saved one. */}
        {draft.explanation.trim() && draft.explanation.trim() !== editing.explanation && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/50">
            <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              What you just typed
            </p>
            <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">
              {draft.explanation.trim()}
            </p>
          </div>
        )}
        <GrammarRuleForm
          initialValue={{
            title: editing.title,
            category: editing.category,
            explanation: editing.explanation,
            examples: editing.examples,
            ref: editing.ref,
          }}
          submitLabel="Save changes"
          onSubmit={(input) => {
            updateGrammarRule(editing.id, input);
            onClose();
          }}
          onCancel={onClose}
          autoFocus
        />
      </Modal>
    );
  }

  if (duplicate) {
    const existing = duplicate;
    return (
      <Modal title="That rule is already saved" onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            You already saved <strong className="font-semibold">{existing.title}</strong>.
            Open it to edit, or go back and change the title?
          </p>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/50">
            <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Existing rule
            </p>
            <p className="whitespace-pre-wrap">
              {existing.explanation || (
                <span className="text-slate-400 italic dark:text-slate-500">
                  No explanation yet
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
    <Modal title="Add a grammar rule" onClose={onClose}>
      <GrammarRuleForm
        initialValue={draft}
        submitLabel="Save rule"
        onSubmit={handleSubmit}
        onCancel={onClose}
        autoFocus
      />
    </Modal>
  );
}
