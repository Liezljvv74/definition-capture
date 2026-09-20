"use client";

import { useId, useState, type FormEvent } from "react";

import { RefField } from "@/components/RefField";
import { EMPTY_GRAMMAR_RULE_INPUT, type GrammarRuleInput } from "@/lib/types";

export function GrammarRuleForm({
  initialValue = EMPTY_GRAMMAR_RULE_INPUT,
  knownCategories,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus = false,
}: {
  initialValue?: GrammarRuleInput;
  /** Categories already in use, offered as suggestions rather than a fixed list. */
  knownCategories: readonly string[];
  submitLabel: string;
  onSubmit: (input: GrammarRuleInput) => void;
  onCancel: () => void;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState<GrammarRuleInput>(initialValue);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

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
         * A text box with suggestions rather than a dropdown. The grammar
         * vocabulary a reader uses is their own and grows as they write, so a
         * fixed list in Settings would mean a round trip through another page
         * before a rule could be filed. The list offers what is already in
         * use, and typing something new files it under that instead.
         */}
        <input
          id={`${ids}-category`}
          className="field"
          list={`${ids}-categories`}
          value={value.category}
          autoComplete="off"
          placeholder="e.g. Cases — or leave blank"
          onChange={(event) =>
            setValue((current) => ({ ...current, category: event.target.value }))
          }
        />
        <datalist id={`${ids}-categories`}>
          {knownCategories.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
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
