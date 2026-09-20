"use client";

import { useId, useMemo, useState, type FormEvent } from "react";

import { RefField } from "@/components/RefField";
import { EMPTY_GRAMMAR_RULE_INPUT, type GrammarRuleInput } from "@/lib/types";
import { useSettings } from "@/lib/useSettings";

export function GrammarRuleForm({
  initialValue = EMPTY_GRAMMAR_RULE_INPUT,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus = false,
}: {
  initialValue?: GrammarRuleInput;
  submitLabel: string;
  onSubmit: (input: GrammarRuleInput) => void;
  onCancel: () => void;
  autoFocus?: boolean;
}) {
  const { settings } = useSettings();
  const [value, setValue] = useState<GrammarRuleInput>(initialValue);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  /**
   * The standing list, plus whatever this rule is already filed under if that
   * is no longer offered. Without the second part, opening a rule whose
   * category had since been removed from Settings and saving it would quietly
   * strip the category — the same guard the term form makes for its own.
   */
  const categoryOptions = useMemo(() => {
    const standing = settings.grammarCategories;
    const current = initialValue.category.trim();
    return current && !standing.includes(current) ? [...standing, current] : standing;
  }, [settings.grammarCategories, initialValue.category]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = value.title.trim();
    if (!title) {
      setError("A title is required.");
      return;
    }
    setError(null);
    onSubmit({
      title,
      category: value.category.trim(),
      explanation: value.explanation.trim(),
      examples: value.examples.trim(),
      ref: value.ref.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor={`${ids}-title`} className="mb-1 block text-sm font-medium">
          Title <span className="text-red-600 dark:text-red-400">*</span>
        </label>
        <input
          id={`${ids}-title`}
          className="field"
          value={value.title}
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder="e.g. Dative after mit"
          onChange={(event) =>
            setValue((current) => ({ ...current, title: event.target.value }))
          }
        />
      </div>

      <div>
        <label htmlFor={`${ids}-category`} className="mb-1 block text-sm font-medium">
          Category
        </label>
        {/*
         * A dropdown from the list in Settings, the way the term form offers
         * its own categories. A rule carries one group or none, so this is a
         * select rather than the checkboxes a term gets.
         */}
        <select
          id={`${ids}-category`}
          className="field"
          value={value.category}
          onChange={(event) =>
            setValue((current) => ({ ...current, category: event.target.value }))
          }
        >
          <option value="">No category</option>
          {categoryOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Edit this list under Grammar Categories in Settings.
        </p>
      </div>

      <div>
        <label htmlFor={`${ids}-explanation`} className="mb-1 block text-sm font-medium">
          Explanation
        </label>
        <textarea
          id={`${ids}-explanation`}
          className="field min-h-24 resize-y"
          value={value.explanation}
          placeholder="What the rule says. Leave blank to fill in later."
          onChange={(event) =>
            setValue((current) => ({ ...current, explanation: event.target.value }))
          }
        />
      </div>

      <div>
        <label htmlFor={`${ids}-examples`} className="mb-1 block text-sm font-medium">
          Examples
        </label>
        <textarea
          id={`${ids}-examples`}
          className="field min-h-24 resize-y"
          value={value.examples}
          placeholder={"One per line — a sentence, and its translation if it helps."}
          onChange={(event) =>
            setValue((current) => ({ ...current, examples: event.target.value }))
          }
        />
      </div>

      <div>
        <label htmlFor={`${ids}-ref`} className="mb-1 block text-sm font-medium">
          Ref
        </label>
        <RefField
          id={`${ids}-ref`}
          value={value.ref}
          placeholder="Notes, a link, or [[Another Entry]]"
          onChange={(ref) => setValue((current) => ({ ...current, ref }))}
          // The rule being edited cannot usefully refer to itself.
          exclude={[initialValue.title, value.title]}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
