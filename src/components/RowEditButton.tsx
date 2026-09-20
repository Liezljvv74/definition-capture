"use client";

/**
 * The pencil at the end of a row, beside the bin.
 *
 * Clicking a row's name already opens the same dialog, but that is not an
 * affordance anyone finds — it looks like a link to a page, and next to a
 * delete icon with no companion it reads as though deleting were the only
 * thing a row can do. Indigo rather than red on hover, so the pair cannot be
 * mistaken for each other at a glance.
 */
export function RowEditButton({
  label,
  onClick,
  className = "",
}: {
  /** The item's own name, so the button says what it edits. */
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Edit ${label}`}
      title={`Edit ${label}`}
      className={`inline-flex cursor-pointer items-center justify-center rounded-md p-1.5 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-400 ${className}`}
    >
      <PencilIcon />
    </button>
  );
}

/** Drawn rather than imported: the app carries no icon set for one glyph. */
function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
    >
      <path d="M14.3 2.7a1.75 1.75 0 0 1 2.5 2.5L7.5 14.5l-3.75 1.25L5 12l9.3-9.3Z" />
      <path d="M12.75 4.25l3 3" />
    </svg>
  );
}
