"use client";

import { useId, useState, type FormEvent } from "react";

import { EMPTY_PHRASE_INPUT, type PhraseInput } from "@/lib/types";

/** Inline code style for the Ref hint lines. */
const hintCode =
  "rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.7rem] text-slate-700 dark:bg-slate-800 dark:text-slate-300";

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
  const [value, setValue] = useState<PhraseInput>(initialValue);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

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

      <div>
        <label htmlFor={`${ids}-ref`} className="mb-1 block text-sm font-medium">
          Ref
        </label>
        <input
          id={`${ids}-ref`}
          className="field"
          value={value.ref}
          autoComplete="off"
          placeholder="Notes, a link, or [[Another Entry]]"
          onChange={(event) => setValue((current) => ({ ...current, ref: event.target.value }))}
          aria-describedby={`${ids}-ref-hint`}
        />
        <div
          id={`${ids}-ref-hint`}
          className="mt-1 space-y-0.5 text-xs text-slate-500 dark:text-slate-400"
        >
          <p>Free text.</p>
          <p>
            <code className={hintCode}>[[Name]]</code> links to a term or another phrase.
          </p>
          <p>
            <code className={hintCode}>/terms/abc123</code> to a page here.
          </p>
          <p>A full URL opens in a new tab.</p>
        </div>
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
