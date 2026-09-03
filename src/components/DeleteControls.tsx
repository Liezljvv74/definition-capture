"use client";

import { useEffect, useRef } from "react";

import { Modal } from "@/components/Modal";

/**
 * The delete affordances every list page in this app shares: a per-row
 * checkbox, a select-all checkbox, a bar for acting on the selection, a
 * per-row delete button, and one confirmation dialog that covers both the
 * single-row and the many-rows case.
 *
 * Any new page that shows a list is expected to use these, so deleting one
 * item or a batch of them works the same way everywhere.
 */

/* --------------------------------------------------------------- checkboxes */

export function SelectRowCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  /** What is being selected, e.g. the term itself — read out by screen readers. */
  label: string;
}) {
  return (
    <input
      type="checkbox"
      className="size-4 cursor-pointer accent-indigo-600"
      checked={checked}
      onChange={onChange}
      aria-label={`Select ${label}`}
    />
  );
}

export function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  // `indeterminate` is a DOM property with no HTML attribute, so React cannot
  // set it from JSX — it has to be written on the node after every render.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className="size-4 cursor-pointer accent-indigo-600"
      checked={checked}
      onChange={onChange}
      aria-label={label}
    />
  );
}

/* ------------------------------------------------------------ selection bar */

export function SelectionBar({
  count,
  noun,
  nounPlural,
  onDelete,
  onClear,
}: {
  count: number;
  noun: string;
  nounPlural: string;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 dark:border-indigo-500/30 dark:bg-indigo-500/10"
      role="region"
      aria-label="Selection actions"
    >
      <p
        aria-live="polite"
        className="text-sm font-medium text-indigo-900 dark:text-indigo-100"
      >
        {count} {count === 1 ? noun : nounPlural} selected
      </p>
      <div className="ml-auto flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary !py-1.5" onClick={onClear}>
          Clear selection
        </button>
        <button type="button" className="btn btn-danger !py-1.5" onClick={onDelete}>
          <TrashIcon />
          Delete selected
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ row delete    */

export function RowDeleteButton({
  label,
  onClick,
  className = "",
}: {
  /** The item's own name, so the button says what it deletes. */
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Delete ${label}`}
      title={`Delete ${label}`}
      className={`inline-flex cursor-pointer items-center justify-center rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 dark:hover:bg-red-500/10 dark:hover:text-red-400 ${className}`}
    >
      <TrashIcon />
    </button>
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="size-4 shrink-0"
    >
      <path
        fillRule="evenodd"
        d="M8.75 1a1 1 0 0 0-.95.68L7.42 3H4a1 1 0 0 0 0 2h12a1 1 0 1 0 0-2h-3.42l-.38-1.32A1 1 0 0 0 11.25 1h-2.5ZM5.06 7a1 1 0 0 1 1-.94h7.88a1 1 0 0 1 1 1.06l-.6 9.06A2 2 0 0 1 12.35 18h-4.7a2 2 0 0 1-2-1.88l-.6-9.06a1 1 0 0 1 .01-.06Zm3.44 2.5a.75.75 0 0 0-1.5 0v5a.75.75 0 0 0 1.5 0v-5Zm4.5 0a.75.75 0 0 0-1.5 0v5a.75.75 0 0 0 1.5 0v-5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/* ------------------------------------------------------- confirmation dialog */

/** How many names to spell out before falling back to "and N more". */
const NAMES_SHOWN = 6;

export function ConfirmDeleteDialog({
  names,
  noun,
  nounPlural,
  onConfirm,
  onCancel,
}: {
  /** The names of everything about to go, in the order shown on screen. */
  names: string[];
  noun: string;
  nounPlural: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const many = names.length !== 1;
  const title = many ? `Delete ${names.length} ${nounPlural}?` : `Delete this ${noun}?`;
  const shown = names.slice(0, NAMES_SHOWN);
  const hidden = names.length - shown.length;

  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-slate-700 dark:text-slate-300">
        {many ? (
          <>
            These {names.length} {nounPlural} will be removed permanently. This cannot be
            undone.
          </>
        ) : (
          <>
            “{names[0]}” will be removed permanently. This cannot be undone.
          </>
        )}
      </p>

      {many && (
        <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-300">
          {shown.map((name, index) => (
            <li key={`${name}-${index}`} className="truncate">
              {name}
            </li>
          ))}
          {hidden > 0 && (
            <li className="text-slate-500 italic dark:text-slate-400">
              …and {hidden} more
            </li>
          )}
        </ul>
      )}

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-danger" onClick={onConfirm} autoFocus>
          <TrashIcon />
          {many ? `Delete ${names.length} ${nounPlural}` : `Delete ${noun}`}
        </button>
      </div>
    </Modal>
  );
}
