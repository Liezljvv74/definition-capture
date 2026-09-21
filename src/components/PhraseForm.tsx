"use client";

import { useId, useMemo, useState, type FormEvent } from "react";

import { RefField } from "@/components/RefField";
import { MAX_CATEGORIES } from "@/lib/constants";
import { EMPTY_PHRASE_INPUT, type PhraseInput } from "@/lib/types";
import { useSettings } from "@/lib/useSettings";

type PhraseFormProps = {
  initialValue?: PhraseInput;
  submitLabel: string;
  onSubmit: (input: PhraseInput) => void;
  onCancel: () => void;
  autoFocus?: boolean;
};

export function PhraseForm({
  initialValue = EMPTY_PHRASE_INPUT,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus = false,
}: PhraseFormProps) {
  const { settings } = useSettings();
  const [value, setValue] = useState<PhraseInput>(initialValue);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  /**
   * The standing list, plus anything this phrase already carries that is no
   * longer offered. Editing a phrase must not quietly strip a category that
   * has since been removed from Settings, which is the same guard the term
   * form makes for its own.
   */
  const categoryOptions = useMemo(() => {
    const standing = settings.categories;
    const extras = initialValue.categories.filter((name) => !standing.includes(name));
    return [...standing, ...extras];
  }, [initialValue, settings.categories]);

  /**
   * Same rule as the categories: the configured list, plus this phrase's own
   * source if it has since been taken off. Saving must not quietly relabel
   * where it came from.
   */
  const sourceOptions = useMemo(() => {
    const standing = settings.sources;
    return standing.includes(initialValue.source)
      ? standing
      : [...standing, initialValue.source];
  }, [initialValue.source, settings.sources]);

  function toggleCategory(name: string) {
    setValue((current) => {
      if (current.categories.includes(name)) {
        return { ...current, categories: current.categories.filter((c) => c !== name) };
      }
      if (current.categories.length >= MAX_CATEGORIES) return current;
      return { ...current, categories: [...current.categories, name] };
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phrase = value.phrase.trim();
    if (!phrase) {
      setError("A phrase is required.");
      return;
    }
    setError(null);
    onSubmit({
      phrase,
      literalMeaning: value.literalMeaning.trim(),
      usageExample: value.usageExample.trim(),
      categories: value.categories,
      source: value.source,
      ref: value.ref.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor={`${ids}-phrase`} className="mb-1 block text-sm font-medium">
          Phrase <span className="text-red-600 dark:text-red-400">*</span>
        </label>
        <input
          id={`${ids}-phrase`}
          className="field"
          value={value.phrase}
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder="e.g. Boil the ocean"
          onChange={(event) =>
            setValue((current) => ({ ...current, phrase: event.target.value }))
          }
        />
      </div>

      <div>
        <label htmlFor={`${ids}-literal`} className="mb-1 block text-sm font-medium">
          Literal meaning
        </label>
        <textarea
          id={`${ids}-literal`}
          className="field min-h-20 resize-y"
          value={value.literalMeaning}
          placeholder="What it actually means. Leave blank to fill in later."
          onChange={(event) =>
            setValue((current) => ({ ...current, literalMeaning: event.target.value }))
          }
        />
      </div>

      <div>
        <label htmlFor={`${ids}-usage`} className="mb-1 block text-sm font-medium">
          Usage example
        </label>
        <textarea
          id={`${ids}-usage`}
          className="field min-h-20 resize-y"
          value={value.usageExample}
          placeholder="A sentence showing it in use."
          onChange={(event) =>
            setValue((current) => ({ ...current, usageExample: event.target.value }))
          }
        />
      </div>

      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium">Category</legend>
        <div className="flex flex-wrap gap-1.5">
          {categoryOptions.map((name) => {
            const checked = value.categories.includes(name);
            // At the cap the unchosen ones go quiet rather than vanishing, so
            // the list does not jump about while you are picking.
            const blocked = !checked && value.categories.length >= MAX_CATEGORIES;
            return (
              <label
                key={name}
                className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition select-none ${
                  checked
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-300"
                    : "border-slate-300 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                } ${
                  blocked
                    ? "cursor-not-allowed opacity-40"
                    : "cursor-pointer hover:border-indigo-400"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  disabled={blocked}
                  onChange={() => toggleCategory(name)}
                />
                {name}
              </label>
            );
          })}
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          The same groups the words use. Up to {MAX_CATEGORIES}
          {value.categories.length > 0 && `, ${value.categories.length} chosen`}.
        </p>
      </fieldset>

      <div>
        <label htmlFor={`${ids}-source`} className="mb-1 block text-sm font-medium">
          Source
        </label>
        <select
          id={`${ids}-source`}
          className="field sm:w-56"
          value={value.source}
          onChange={(event) => {
            const next = event.target.value;
            if (next) setValue((current) => ({ ...current, source: next }));
          }}
        >
          {sourceOptions.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
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
          // The phrase being edited cannot usefully refer to itself.
          exclude={[initialValue.phrase, value.phrase]}
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
