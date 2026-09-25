"use client";

import type { ImportCounts, ImportMode } from "@/lib/types";

/**
 * One line of the "this is what Replace will do" list.
 *
 * Replace saves the file over the list and deletes only what the file does
 * not have, so the line names that number rather than the whole list.
 * `matching` is the preview's count of file rows whose name is saved already,
 * so the number is an estimate either way: a row renamed since the backup is
 * matched by id as well and survives (fewer go than it says), while a name the
 * file repeats is counted twice (more go than it says).
 */
export function ReplaceLine({
  label,
  saved,
  incoming,
  matching,
  untouched,
}: {
  label: string;
  saved: number;
  incoming: number;
  /** How many of the saved rows the file has too. */
  matching: number;
  untouched: boolean;
}) {
  const removed = Math.max(0, saved - matching);
  return (
    <li className="flex flex-wrap gap-x-1.5">
      <span className="font-medium">{label}:</span>
      {untouched ? (
        <span className="text-slate-600 dark:text-slate-300">
          nothing in this file, so your {saved} saved{" "}
          {saved === 1 ? "item stays" : "items stay"} as they are
        </span>
      ) : (
        <span className={removed > 0 ? "text-red-700 dark:text-red-300" : ""}>
          replaced by the {incoming} in the file
          {removed > 0 ? `, and ${removed} of yours not in it deleted` : ", nothing deleted"}
        </span>
      )}
    </li>
  );
}

/** One radio in the "what to export" list. */
export function ScopeChoice({
  label,
  detail,
  checked,
  disabled,
  onSelect,
}: {
  label: string;
  detail: string;
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition ${
        checked
          ? "border-indigo-500 bg-indigo-50/60 dark:border-indigo-400 dark:bg-indigo-500/10"
          : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <input
        type="radio"
        name="export-scope"
        className="mt-0.5 size-4 accent-indigo-600"
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">{detail}</span>
      </span>
    </label>
  );
}

/** One of the two file formats an export can take. */
export function ExportChoice({
  title,
  detail,
  disabled,
  onClick,
}: {
  title: string;
  detail: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full cursor-pointer rounded-lg border border-slate-200 p-3 text-left transition hover:border-indigo-400 hover:bg-indigo-50/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:hover:border-indigo-500/60 dark:hover:bg-indigo-500/10"
    >
      <span className="block text-sm font-medium">{title}</span>
      <span className="block text-xs text-slate-500 dark:text-slate-400">{detail}</span>
    </button>
  );
}

/** What one list ended up with, on the "import finished" screen. */
export function ResultBlock({
  label,
  counts,
  mode,
}: {
  label: string;
  counts: ImportCounts;
  mode: ImportMode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {label}
      </p>
      <ul className="mt-1 space-y-0.5">
        <li>
          <strong className="font-semibold">{counts.added}</strong>{" "}
          {mode === "replace" ? "restored" : "added"}
        </li>
        {mode !== "replace" && (
          <>
            <li>
              <strong className="font-semibold">{counts.updated}</strong> updated
            </li>
            <li>
              <strong className="font-semibold">{counts.skipped}</strong> already saved, left
              alone
            </li>
          </>
        )}
      </ul>
    </div>
  );
}

export const MODE_OPTIONS: { value: ImportMode; label: string; hint: string }[] = [
  {
    value: "skip",
    label: "Add only what I don't have",
    hint: "Nothing already saved is touched.",
  },
  {
    value: "update",
    label: "Add new and update matching",
    hint: "The backup overwrites what you have.",
  },
  {
    value: "replace",
    label: "Replace everything with this backup",
    hint: "Anything saved now that is not in the backup is deleted.",
  },
];

/**
 * Shown while the lists are still being fetched.
 *
 * Not cosmetic. `buildBackup` reads the stores' in-memory cache, and these
 * dialogs can now be opened from any page — including ones that show no list
 * and so never started one. Exporting before the first read came back would
 * quietly write an empty file.
 */
export function WaitingForLists() {
  return (
    <p className="text-sm text-slate-500 dark:text-slate-400">Loading your lists…</p>
  );
}
