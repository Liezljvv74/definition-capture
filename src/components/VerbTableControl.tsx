"use client";

import Link from "next/link";

import { useVerbTables } from "@/lib/useVerbTables";

/**
 * Points at a verb's conjugation table, from the term it belongs to — either
 * to the table that exists, or to making one.
 *
 * Neither case does any work here. Making a table lands on the Verbs page
 * with `?new=`, and that page asks who verbs conjugate for if it has not been
 * told yet, then builds the table. Keeping the question there means the
 * reader ends up looking at the thing they asked for, rather than answering a
 * question inside a dialog about something else and then being told where to
 * go next.
 */
export function VerbTableControl({ verb }: { verb: string }) {
  const { tables } = useVerbTables();

  const name = verb.trim();
  const existing = tables.some(
    (table) => table.verb.toLocaleLowerCase() === name.toLocaleLowerCase(),
  );

  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <p className="text-sm font-medium">Conjugation table</p>

      {existing ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {name} already has one.
          </p>
          <Link
            href={`/verbs?verb=${encodeURIComponent(name)}`}
            aria-label={`Open the conjugation table for ${name}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-300"
          >
            <TableIcon />
            Open it
          </Link>
        </div>
      ) : (
        <div className="mt-1.5">
          <Link
            href={`/verbs?new=${encodeURIComponent(name)}`}
            className="btn btn-secondary !px-2.5 !py-1 text-xs"
          >
            + Create a conjugation table
          </Link>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Takes you to the table on the Verbs page.
          </p>
        </div>
      )}
    </div>
  );
}

/** A small grid, for "there is a table over here". */
function TableIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      className="size-4"
    >
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M2 6.5h12M6.5 6.5V13" />
    </svg>
  );
}
