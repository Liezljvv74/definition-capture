"use client";

import { useId, useState } from "react";

import type { VerbRow, VerbTable } from "@/lib/types";
import { deleteVerbTable, saveVerbRows } from "@/lib/verbTables";

/**
 * One verb's conjugation table, rolled up to its name until you open it.
 *
 * The rows are held here as a draft while you type and only reach the store
 * on Save, which is what lets Cancel mean something. Saving folds the table
 * away again: filling one in is a task with an end, and the page is a list of
 * verbs rather than a wall of conjugations.
 */
export function VerbTableCard({
  table,
  startOpen = false,
}: {
  table: VerbTable;
  /** Opened by the Verbs page when a link named this verb. */
  startOpen?: boolean;
}) {
  const bodyId = useId();
  const [open, setOpen] = useState(startOpen);
  const [rows, setRows] = useState<VerbRow[]>(table.rows);
  /** Which row has its notes showing, by index. */
  const [notesOpen, setNotesOpen] = useState<number | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  function edit(index: number, change: Partial<VerbRow>) {
    setRows((current) =>
      current.map((row, at) => (at === index ? { ...row, ...change } : row)),
    );
  }

  function save() {
    saveVerbRows(table.id, rows);
    setNotesOpen(null);
    setConfirmingRemove(false);
    setOpen(false);
  }

  function cancel() {
    setRows(table.rows);
    setNotesOpen(null);
    setConfirmingRemove(false);
    setOpen(false);
  }

  return (
    <section
      className={`card px-3 py-2 transition-[width] ${
        // Rolled up, a verb is just its name, so the row is only as wide
        // as it needs to be — an eighth of a wide screen. Opened, it has
        // a table in it and takes the room that needs.
        open ? "w-full max-w-2xl" : "w-full sm:w-1/2 lg:w-[12.5%] lg:min-w-44"
      }`}
    >
      {/* The rolled-up row is the whole verb list, so it stays a single
          compact line: the name, and the way in. What is inside the table
          is what opening it is for. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => (open ? cancel() : setOpen(true))}
        className="flex w-full cursor-pointer items-center justify-between gap-3 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
      >
        <span className="truncate text-sm font-medium">{table.verb}</span>
        <span
          aria-hidden="true"
          className={`shrink-0 text-[0.6rem] text-slate-400 transition dark:text-slate-500 ${
            open ? "rotate-180" : ""
          }`}
        >
          ▼
        </span>
      </button>

      <div id={bodyId} hidden={!open} className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-800">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <thead className="border-b border-slate-200 text-xs tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th scope="col" className="w-[28%] px-2 py-2 font-semibold">
                Person
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                Conjugation
              </th>
              <th scope="col" className="w-16 px-2 py-2 font-semibold">
                <span className="sr-only">Notes</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {rows.map((row, index) => (
              <RowFields
                key={index}
                row={row}
                notesShowing={notesOpen === index}
                onToggleNotes={() => setNotesOpen(notesOpen === index ? null : index)}
                onChange={(change) => edit(index, change)}
              />
            ))}
          </tbody>
        </table>

        {rows.length === 0 && (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            This table has no people in it. Add them under Settings → Verb
            persons, then make the table again.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          {confirmingRemove ? (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-slate-600 dark:text-slate-300">
                Delete the table for {table.verb}?
              </span>
              <button
                type="button"
                className="btn btn-danger !px-2.5 !py-1 text-xs"
                onClick={() => deleteVerbTable(table.id)}
              >
                Delete
              </button>
              <button
                type="button"
                className="btn btn-secondary !px-2.5 !py-1 text-xs"
                onClick={() => setConfirmingRemove(false)}
              >
                Keep
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="cursor-pointer text-xs font-medium text-red-700 hover:underline dark:text-red-400"
              onClick={() => setConfirmingRemove(true)}
            >
              Delete this table
            </button>
          )}

          <span className="flex gap-2">
            <button type="button" className="btn btn-secondary" onClick={cancel}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={save}>
              Save
            </button>
          </span>
        </div>
      </div>
    </section>
  );
}

/** A pen when the row has notes, an outline when it does not. */
function NotesIcon({ written }: { written: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill={written ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
    >
      <path d="M3 2.5h7.5L13 5v8.5H3z" fill={written ? "currentColor" : "none"} />
      <path d="M5.5 7h5M5.5 9.5h3" stroke={written ? "var(--color-white, #fff)" : "currentColor"} />
    </svg>
  );
}

function RowFields({
  row,
  notesShowing,
  onToggleNotes,
  onChange,
}: {
  row: VerbRow;
  notesShowing: boolean;
  onToggleNotes: () => void;
  onChange: (change: Partial<VerbRow>) => void;
}) {
  const ids = useId();
  const written = row.notes.trim().length > 0;

  return (
    <>
      <tr>
        <td className="px-2 py-2 align-top font-medium">{row.person}</td>
        <td className="px-2 py-2 align-top">
          <label htmlFor={`${ids}-conj`} className="sr-only">
            {`Conjugation for ${row.person}`}
          </label>
          <input
            id={`${ids}-conj`}
            className="field"
            value={row.conjugation}
            onChange={(event) => onChange({ conjugation: event.target.value })}
          />
        </td>
        <td className="px-2 py-2 align-top">
          <button
            type="button"
            onClick={onToggleNotes}
            aria-expanded={notesShowing}
            aria-label={`${written ? "Edit" : "Add"} notes for ${row.person}`}
            title={written ? row.notes : "Add a note"}
            className={`cursor-pointer rounded-md p-1.5 transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
              written
                ? "text-indigo-700 dark:text-indigo-300"
                : "text-slate-400 dark:text-slate-500"
            }`}
          >
            <NotesIcon written={written} />
          </button>
        </td>
      </tr>
      {notesShowing && (
        <tr>
          <td />
          <td colSpan={2} className="px-2 pb-3">
            <label htmlFor={`${ids}-notes`} className="sr-only">
              {`Notes for ${row.person}`}
            </label>
            <textarea
              id={`${ids}-notes`}
              className="field min-h-16 resize-y"
              placeholder={`Anything worth remembering about ${row.person}.`}
              value={row.notes}
              onChange={(event) => onChange({ notes: event.target.value })}
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Saved with the table.
            </p>
          </td>
        </tr>
      )}
    </>
  );
}
