"use client";

import { foldName } from "@/lib/foldName";
import { useId, useState } from "react";

import { RowDeleteButton } from "@/components/DeleteControls";
import { MAX_LIST_LENGTH } from "@/lib/constants";

/**
 * Add, rename and remove a short list of names, such as the collections and
 * the sources the word form offers. There is no reordering: the lists arrive
 * sorted from `settings.ts`, and the one that keeps its own order, the verb
 * persons, takes the order names are added in.
 *
 * What removing a name means depends on the list. Collections and sources are
 * what words and phrases point at, so one still in use cannot be removed:
 * those lists pass `removeBlockedBy`, which switches the bin off and says why,
 * and the database refuses the delete as well. The other lists are only lists,
 * and removing a name there changes nothing already saved. Renaming reaches
 * the data only where the list passes `onRename`, which decides what a rename
 * reaches.
 */
export function NameListEditor({
  legend,
  description,
  names,
  onChange,
  minimum = 0,
  placeholder,
  maxLength,
  onRename,
  removeBlockedBy,
}: {
  legend: string;
  description: string;
  names: string[];
  onChange: (next: string[]) => void;
  /** Below this many the remove buttons switch off. */
  minimum?: number;
  placeholder: string;
  /**
   * The longest one name may be, where the list has a limit of its own.
   * Checked on Add with a message rather than set on the input, which would
   * let the browser cut a pasted name short and save a different word.
   */
  maxLength?: number;
  /**
   * Shows a pencil on each row for renaming it. Resolves to an error message,
   * or null once the rename has been made, which is when the row closes.
   */
  onRename?: (from: string, to: string) => Promise<string | null>;
  /** Why a name cannot be removed right now, or undefined when it can. */
  removeBlockedBy?: (name: string) => string | undefined;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** The name whose row is open for renaming, if any. */
  const [editing, setEditing] = useState<string | null>(null);
  const [rename, setRename] = useState("");
  const [busy, setBusy] = useState(false);

  /** Why a name cannot join the list, or null when it can. `except` is the
   *  name being renamed, which must not count as a clash with itself. */
  function problemWith(name: string, except?: string): string | null {
    const clash = names.some(
      (existing) =>
        existing !== except && foldName(existing) === foldName(name),
    );
    if (clash) return `"${name}" is already on the list.`;
    if (maxLength !== undefined && name.length > maxLength) {
      return `That is longer than this list takes (${maxLength} characters).`;
    }
    return null;
  }

  function add() {
    const name = draft.trim();
    if (!name) return;

    const problem = problemWith(name);
    if (problem) {
      setError(problem);
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

  function startRenaming(name: string) {
    setEditing(name);
    setRename(name);
    setError(null);
  }

  function stopRenaming() {
    setEditing(null);
    setRename("");
  }

  async function saveRename() {
    if (!onRename || editing === null) return;
    const name = rename.trim();
    if (!name || name === editing) {
      stopRenaming();
      return;
    }
    const problem = problemWith(name, editing);
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);
    const failure = await onRename(editing, name);
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    stopRenaming();
  }

  function remove(index: number) {
    setError(null);
    onChange(names.filter((_, position) => position !== index));
  }

  const iconButton =
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
            {editing === name ? (
              <>
                <label htmlFor={`${inputId}-rename`} className="sr-only">
                  {`New name for ${name}`}
                </label>
                <input
                  id={`${inputId}-rename`}
                  className="field flex-1 py-1"
                  value={rename}
                  disabled={busy}
                  autoFocus
                  onChange={(event) => {
                    setRename(event.target.value);
                    setError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      stopRenaming();
                    }
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    void saveRename();
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary shrink-0 px-2.5 py-1 text-xs"
                  disabled={busy || rename.trim() === ""}
                  onClick={() => void saveRename()}
                >
                  {busy ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary shrink-0 px-2.5 py-1 text-xs"
                  disabled={busy}
                  onClick={stopRenaming}
                >
                  Cancel
                </button>
              </>
            ) : (
              <span className="flex-1 truncate text-sm">{name}</span>
            )}
            {onRename && editing !== name && (
              <button
                type="button"
                className={iconButton}
                disabled={busy}
                onClick={() => startRenaming(name)}
                aria-label={`Rename ${name}`}
                title={`Rename ${name}`}
              >
                <PencilIcon />
              </button>
            )}
            {editing !== name && (
              <RowDeleteButton
                label={name}
                onClick={() => remove(index)}
                disabledReason={
                  names.length <= minimum
                    ? "At least one has to stay on the list"
                    : removeBlockedBy?.(name)
                }
              />
            )}
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

function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
    >
      <path d="M11.5 2.5a1.4 1.4 0 0 1 2 2L6 12l-3 1 1-3 7.5-7.5Z" />
    </svg>
  );
}
