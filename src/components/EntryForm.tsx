"use client";

import { useId, useMemo, useState, type ClipboardEvent, type FormEvent } from "react";

import { RefField } from "@/components/RefField";
import { CATEGORIES, MAX_CATEGORIES, SOURCES } from "@/lib/constants";
import { splitTermAndDefinition } from "@/lib/parseTerm";
import { EMPTY_ENTRY_INPUT, isSource, type EntryInput } from "@/lib/types";

/** Inline code style for the Ref hint lines. */
const hintCode =
  "rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.7rem] text-slate-700 dark:bg-slate-800 dark:text-slate-300";

type EntryFormProps = {
  initialValue?: EntryInput;
  submitLabel: string;
  onSubmit: (input: EntryInput) => void;
  onCancel: () => void;
  /** Only the "add" form splits pasted "term: definition" text. */
  autoSplit?: boolean;
  autoFocus?: boolean;
};

export function EntryForm({
  initialValue = EMPTY_ENTRY_INPUT,
  submitLabel,
  onSubmit,
  onCancel,
  autoSplit = false,
  autoFocus = false,
}: EntryFormProps) {
  const [value, setValue] = useState<EntryInput>(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [didSplit, setDidSplit] = useState(false);
  const ids = useId();

  /**
   * Split "term: definition" into both fields. Only fills Definition when it is
   * still empty, so text already typed there is never overwritten.
   */
  function tryAutoSplit(text: string): boolean {
    if (!autoSplit || value.definition.trim()) return false;
    const split = splitTermAndDefinition(text);
    if (!split) return false;
    setValue((current) => ({ ...current, ...split }));
    setDidSplit(true);
    return true;
  }

  function handleTermPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text");
    const input = event.currentTarget;
    // Only intercept a paste that replaces the whole field, so a paste into the
    // middle of an existing term behaves normally.
    const replacesAll =
      input.selectionStart === 0 && input.selectionEnd === input.value.length;
    if (!replacesAll) return;
    if (tryAutoSplit(pasted)) event.preventDefault();
  }

  /**
   * The standing list, plus any name this entry already carries that is no
   * longer offered — editing a term must not quietly strip a category just
   * because the list in `constants.ts` has moved on since it was filed.
   */
  const categoryOptions = useMemo(() => {
    const standing = CATEGORIES as readonly string[];
    const extras = initialValue.categories.filter((name) => !standing.includes(name));
    return [...standing, ...extras];
  }, [initialValue]);

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
    const term = value.term.trim();
    if (!term) {
      setError("A term is required.");
      return;
    }
    setError(null);
    onSubmit({ ...value, term, definition: value.definition.trim() });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor={`${ids}-term`} className="mb-1 block text-sm font-medium">
          Term <span className="text-red-600 dark:text-red-400">*</span>
        </label>
        <input
          id={`${ids}-term`}
          className="field"
          value={value.term}
          autoFocus={autoFocus}
          autoComplete="off"
          placeholder="e.g. Idempotent"
          onPaste={handleTermPaste}
          onChange={(event) => {
            setDidSplit(false);
            setValue((current) => ({ ...current, term: event.target.value }));
          }}
          onBlur={(event) => tryAutoSplit(event.target.value)}
          aria-describedby={`${ids}-term-hint`}
        />
        <p id={`${ids}-term-hint`} className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {autoSplit
            ? didSplit
              ? "Split into Term and Definition — edit either field if that isn't right."
              : "Paste \u201cterm: definition\u201d or \u201cterm - definition\u201d and it splits itself."
            : "The word or concept you want to remember."}
        </p>
      </div>

      <div>
        <label htmlFor={`${ids}-definition`} className="mb-1 block text-sm font-medium">
          Definition
        </label>
        <textarea
          id={`${ids}-definition`}
          className="field min-h-28 resize-y"
          value={value.definition}
          placeholder="Leave blank to come back and fill it in later."
          onChange={(event) =>
            setValue((current) => ({ ...current, definition: event.target.value }))
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
          Groups terms that belong together. Up to {MAX_CATEGORIES}
          {value.categories.length > 0 && ` — ${value.categories.length} chosen`}.
        </p>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
        <div>
          <label htmlFor={`${ids}-source`} className="mb-1 block text-sm font-medium">
            Source
          </label>
          <select
            id={`${ids}-source`}
            className="field"
            value={value.source}
            onChange={(event) => {
              const next = event.target.value;
              if (isSource(next)) setValue((current) => ({ ...current, source: next }));
            }}
          >
            {SOURCES.map((source) => (
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
            placeholder="Notes, a link, or [[Another Term]]"
            onChange={(ref) => setValue((current) => ({ ...current, ref }))}
            describedBy={`${ids}-ref-hint`}
            // A term referring to itself is a link back to the page you are
            // already on. Both names are excluded so a rename mid-edit cannot
            // make the old one selectable again.
            exclude={[initialValue.term, value.term]}
          />
          <div
            id={`${ids}-ref-hint`}
            className="mt-1 space-y-0.5 text-xs text-slate-500 dark:text-slate-400"
          >
            <p>Free text.</p>
            <p>
              <code className={hintCode}>[[Term]]</code> links to another entry — type a
              name to pick one.
            </p>
            <p>
              <code className={hintCode}>/term?id=abc123</code> to a page here.
            </p>
            <p>A full URL opens in a new tab.</p>
          </div>
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
