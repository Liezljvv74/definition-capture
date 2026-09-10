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
        open ? "w-full max-w-xs" : "w-full sm:w-1/2 lg:w-[12.5%] lg:min-w-44"
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

      <div id={bodyId} hidden={!open} className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-800">
        <table className="w-full table-fixed border-collapse text-left text-xs">
          <thead className="border-b border-slate-200 text-[0.65rem] tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th scope="col" className="w-[34%] px-1 py-1 font-semibold">
                Person
              </th>
              <th scope="col" className="px-1 py-1 text-left font-semibold">
                {/* The tense is the heading now. “Conjugation” stays for
                    screen readers, which otherwise meet a column with no
                    name at all — and none on a table made before tenses
                    were asked for. */}
                <span className="sr-only">Conjugation</span>
                {table.tense && (
                  <strong className="font-bold text-slate-700 dark:text-slate-200">
                    {table.tense}
                  </strong>
                )}
              </th>
              <th scope="col" className="w-8 px-1 py-1 font-semibold">
                <span className="sr-only">Notes</span>
              </th>
            </tr>
          </thead>
          <tbody>
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

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
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
              className="cursor-pointer text-[0.7rem] font-medium text-red-700 hover:underline dark:text-red-400"
              onClick={() => setConfirmingRemove(true)}
            >
              Delete this table
            </button>
          )}

          <span className="flex gap-2">
            <button type="button" className="btn btn-secondary !px-2 !py-0.5 text-xs" onClick={cancel}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary !px-2 !py-0.5 text-xs" onClick={save}>
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
        <td className="px-1 py-0.5 align-middle font-medium">{row.person}</td>
        <td className="px-1 py-0.5 align-middle">
          <label htmlFor={`${ids}-conj`} className="sr-only">
            {`Conjugation for ${row.person}`}
          </label>
          <input
            id={`${ids}-conj`}
            className="field !px-1.5 !py-0.5 text-xs"
            value={row.conjugation}
            onChange={(event) => onChange({ conjugation: event.target.value })}
          />
        </td>
        <td className="px-1 py-0.5 align-middle">
          <button
            type="button"
            onClick={onToggleNotes}
            aria-expanded={notesShowing}
            aria-label={`${written ? "Edit" : "Add"} notes for ${row.person}`}
            title={written ? row.notes : "Add a note"}
            className={`cursor-pointer rounded p-0.5 transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
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
          <td colSpan={2} className="px-1 pb-1.5">
            <label htmlFor={`${ids}-notes`} className="sr-only">
              {`Notes for ${row.person}`}
            </label>
            <textarea
              id={`${ids}-notes`}
              rows={2}
              className="field !px-1.5 !py-1 min-h-0 resize-y text-xs"
              placeholder={`Note for ${row.person}`}
              value={row.notes}
              onChange={(event) => onChange({ notes: event.target.value })}
            />
          </td>
        </tr>
      )}
    </>
  );
}
