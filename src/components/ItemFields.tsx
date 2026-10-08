"use client";

import { useMemo } from "react";

import { MAX_COLLECTIONS } from "@/lib/constants";
import { useSettings } from "@/lib/useSettings";

/**
 * The fields the word and phrase forms share. They were two copies of the
 * same markup and the same two rules below, and a rule kept in two places is
 * one edit away from holding in only one of them.
 */

/**
 * The collection chips, at most `MAX_COLLECTIONS` chosen. The standing list
 * comes from Settings, plus any name the item already carries that is no
 * longer offered: editing must not quietly strip a collection because it has
 * since been removed from Settings.
 */
export function CollectionPicker({
  initial,
  chosen,
  onChange,
  hint,
}: {
  /** The collections the item was saved with, which stay offered. */
  initial: readonly string[];
  chosen: string[];
  onChange: (collections: string[]) => void;
  hint: string;
}) {
  const { settings } = useSettings();
  const options = useMemo(() => {
    const standing = settings.collections;
    return [...standing, ...initial.filter((name) => !standing.includes(name))];
  }, [initial, settings.collections]);

  function toggle(name: string) {
    if (chosen.includes(name)) onChange(chosen.filter((c) => c !== name));
    else if (chosen.length < MAX_COLLECTIONS) onChange([...chosen, name]);
  }

  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-medium">Collection</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((name) => {
          const checked = chosen.includes(name);
          // At the cap the unchosen ones go quiet rather than vanishing, so
          // the list does not jump about while you are picking.
          const blocked = !checked && chosen.length >= MAX_COLLECTIONS;
          return (
            <label
              key={name}
              className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition select-none ${
                checked
                  ? "border-ink bg-marker/30 text-ink"
                  : "border-rule bg-card text-ink-soft"
              } ${
                blocked
                  ? "cursor-not-allowed opacity-40"
                  : "cursor-pointer hover:border-ink"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                disabled={blocked}
                onChange={() => toggle(name)}
              />
              {name}
            </label>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-ink-soft">
        {hint} Up to {MAX_COLLECTIONS}
        {chosen.length > 0 && `, ${chosen.length} chosen`}.
      </p>
    </fieldset>
  );
}

/**
 * The Source dropdown: the configured sources, plus the item's own if it has
 * since been taken off, so saving must not quietly relabel where it came from.
 */
export function SourceSelect({
  id,
  initial,
  value,
  onChange,
  className = "field",
}: {
  id: string;
  /** The source the item was saved with, which stays offered. */
  initial: string;
  value: string;
  onChange: (source: string) => void;
  className?: string;
}) {
  const { settings } = useSettings();
  const options = useMemo(() => {
    const standing = settings.sources;
    return standing.includes(initial) ? standing : [...standing, initial];
  }, [initial, settings.sources]);

  return (
    <>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        Source
      </label>
      <select
        id={id}
        className={className}
        value={value}
        onChange={(event) => {
          if (event.target.value) onChange(event.target.value);
        }}
      >
        {options.map((source) => (
          <option key={source} value={source}>
            {source}
          </option>
        ))}
      </select>
    </>
  );
}

/** The form's error, then Cancel and the submit button. */
export function FormFooter({
  error,
  submitLabel,
  onCancel,
}: {
  error: string | null;
  submitLabel: string;
  onCancel: () => void;
}) {
  return (
    <>
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
    </>
  );
}
