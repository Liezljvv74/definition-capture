"use client";

import { useState } from "react";

import { GrammarRuleForm } from "@/components/GrammarRuleForm";
import { Modal } from "@/components/Modal";
import { findByTitle, updateGrammarRule } from "@/lib/grammarRules";
import type { GrammarRule, GrammarRuleInput } from "@/lib/types";

/**
 * Edits a saved rule without leaving the list — the counterpart to
 * `AddGrammarRuleDialog`, working the same way the term and phrase pair do.
 */
export function EditGrammarRuleDialog({
  rule,
  onClose,
}: {
  rule: GrammarRule;
  onClose: () => void;
}) {
  /** Set when the new title collides with a *different* saved rule. */
  const [clash, setClash] = useState<GrammarRule | null>(null);
  // The clash screen replaces the form rather than sitting on top of it, so
  // the form unmounts and its state goes with it. Holding the draft here
  // means "Back to editing" returns the rename in progress.
  const [draft, setDraft] = useState<GrammarRuleInput>({
    title: rule.title,
    category: rule.category,
    explanation: rule.explanation,
    examples: rule.examples,
    ref: rule.ref,
  });

  function handleSubmit(input: GrammarRuleInput) {
    const existing = findByTitle(input.title, rule.id);
    if (existing) {
      // Renaming onto another rule would leave two with the same title, which
      // the unique index refuses and `[[Name]]` could not tell apart.
      setDraft(input);
      setClash(existing);
      return;
    }
    updateGrammarRule(rule.id, input);
    onClose();
  }

  if (clash) {
    return (
      <Modal title="Another rule already has that title" onClose={onClose}>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <strong className="font-semibold">{clash.title}</strong> is already saved
          separately. Change the title, or delete one of the two from the list.
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
    <Modal title="Edit grammar rule" onClose={onClose}>
      <GrammarRuleForm
        initialValue={draft}
        submitLabel="Save changes"
        onSubmit={handleSubmit}
        onCancel={onClose}
        autoFocus
      />
    </Modal>
  );
}
