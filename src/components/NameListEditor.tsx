"use client";

import { useId, useState } from "react";

import { MAX_LIST_LENGTH } from "@/lib/constants";

/**
 * Add, remove, and reorder a short list of names — the categories and the
 * sources the term form offers. Order is kept rather than sorted, because the
 * source list is a rough order of trust and the Source column sorts by it.
 *
 * Editing here never touches what is already saved on a term: a term filed
 * under a category that is removed keeps it, and the form still offers that
 * one name while you are editing that term. Removing a name stops it being
 * suggested; it does not go back through the data.
 */
export function NameListEditor({
  legend,
  description,
  names,
  onChange,
  minimum = 0,
  placeholder,
}: {
  legend: string;
  description: string;
  names: string[];
  onChange: (next: string[]) => void;
  /** Below this many the remove buttons switch off. */
  minimum?: number;
  placeholder: string;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const name = draft.trim();
    if (!name) return;

    if (names.some((existing) => existing.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setError(`"${name}" is already on the list.`);
      return;
    }
    if (names.length >= MAX_LIST_LENGTH) {
      setError(`That is as many as one list holds (${MAX_LIST_LENGTH}).`);
      return;
    }

    setError(null);
    setDraft("");
    onChange([...names, name]);
  }

  function remove(index: number) {
    setError(null);
    onChange(names.filter((_, position) => position !== index));
  }

  function move(index: number, by: -1 | 1) {
    const target = index + by;
    if (target < 0 || target >= names.length) return;
    const next = [...names];
    [next[index], next[target]] = [next[target], next[index]];
    setError(null);
    onChange(next);
  }

  const arrow =
    "cursor-pointer rounded px-1.5 py-0.5 text-xs text-slate-500 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-700";

  return (
    <fieldset>
      {/* The rolled-up section header already shows this name, so the legend
          is for screen readers only — a fieldset still needs one. */}
      <legend className="sr-only">{legend}</legend>
      <p className="text-sm text-slate-600 dark:text-slate-300">{description}</p>

      <ul className="mt-3 space-y-1.5">
        {names.map((name, index) => (
          <li
            key={name}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5 dark:border-slate-800"
          >
            <span className="flex-1 truncate text-sm">{name}</span>
            <button
              type="button"
              className={arrow}
              disabled={index === 0}
              onClick={() => move(index, -1)}
              aria-label={`Move ${name} up`}
            >
              ▲
            </button>
            <button
              type="button"
              className={arrow}
              disabled={index === names.length - 1}
              onClick={() => move(index, 1)}
              aria-label={`Move ${name} down`}
            >
              ▼
            </button>
            <button
              type="button"
              className="cursor-pointer rounded px-1.5 py-0.5 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30 dark:text-red-400 dark:hover:bg-red-950/40"
              disabled={names.length <= minimum}
              onClick={() => remove(index)}
              aria-label={`Remove ${name}`}
              title={
                names.length <= minimum
                  ? "At least one has to stay on the list"
                  : `Remove ${name}`
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          {`Add to ${legend}`}
        </label>
        <input
          id={inputId}
          className="field flex-1"
          value={draft}
          placeholder={placeholder}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            // Enter adds the name rather than submitting anything: this sits
            // on a settings page, not in a form with a primary action.
            if (event.key !== "Enter") return;
            event.preventDefault();
            add();
          }}
        />
        <button
          type="button"
          className="btn btn-secondary shrink-0"
          disabled={draft.trim() === ""}
          onClick={add}
        >
          Add
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </fieldset>
  );
}
