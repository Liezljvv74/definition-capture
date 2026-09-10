"use client";

import { useId, useState } from "react";

import { saveSettings } from "@/lib/settings";
import { MAX_TENSES, type VerbRow, type VerbTable } from "@/lib/types";
import { useSettings } from "@/lib/useSettings";
import { deleteVerbTable, saveVerbTable } from "@/lib/verbTables";

/**
 * One verb's conjugation table, rolled up to its name until you open it.
 *
 * A table holds a column per tense. `tenses[i]` heads the column that every
 * row's `conjugations[i]` fills, so the two are edited together and saved
 * together — a heading without its column, or the reverse, is not a state
 * worth being able to reach.
 *
 * Everything is a draft until Save, which is what lets Cancel mean
 * something. Saving folds the table away again: filling one in is a task
 * with an end, and the page is a list of verbs.
 *
 * Whether it is open belongs to the page, not here: only one table is open
 * at a time, and a card cannot know that another has been opened. The page
 * also remounts a card as it opens, which is what makes the draft below
 * start from what is stored rather than from an abandoned edit.
 *
 * Because closing throws the draft away, the page holds a card back once
 * it has been edited and hands it `asking` — the moment to offer to save
 * instead. The offer is made here rather than on the page so that it
 * appears beside the work it is about, whichever card was clicked.
 */
export function VerbTableCard({
  table,
  open,
  asking,
  onToggle,
  onEdited,
  onKeep,
  onFinish,
}: {
  table: VerbTable;
  open: boolean;
  /** True while the page is waiting to hear what to do with unsaved work. */
  asking: boolean;
  /** Asks the page to open this table, or to close it. May be held back. */
  onToggle: () => void;
  /** The draft has changed; from here on, closing it is guarded. */
  onEdited: () => void;
  /** Nothing to decide after all — stay open and carry on. */
  onKeep: () => void;
  /** Saved, discarded or deleted: the page may close it and move on. */
  onFinish: () => void;
}) {
  const bodyId = useId();
  const { settings } = useSettings();
  const [tenses, setTenses] = useState<string[]>(table.tenses);
  const [rows, setRows] = useState<VerbRow[]>(table.rows);
  /** Which row has its notes showing, by index. */
  const [notesOpen, setNotesOpen] = useState<number | null>(null);
  /**
   * Where a new tense is going while it is being named: the index it will
   * take, so 0 is before the first column and `tenses.length` after the
   * last. Null when nothing is being added.
   */
  const [adding, setAdding] = useState<number | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const full = tenses.length >= MAX_TENSES;

  function editCell(rowAt: number, columnAt: number, value: string) {
    onEdited();
    setRows((current) =>
      current.map((row, at) =>
        at === rowAt
          ? {
              ...row,
              conjugations: row.conjugations.map((cell, column) =>
                column === columnAt ? value : cell,
              ),
            }
          : row,
      ),
    );
  }

  function editNotes(rowAt: number, notes: string) {
    onEdited();
    setRows((current) => current.map((row, at) => (at === rowAt ? { ...row, notes } : row)));
  }

  /** Inserts a column at `at`, and the empty cell it needs in every row. */
  function addTense(name: string, at: number) {
    onEdited();
    setTenses((current) => current.toSpliced(at, 0, name));
    setRows((current) =>
      current.map((row) => ({
        ...row,
        conjugations: row.conjugations.toSpliced(at, 0, ""),
      })),
    );
    setAdding(null);

    // Remembered for the dropdown, here as well as on the new-table screen.
    const known = settings.verbTenses.some(
      (candidate) => candidate.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (!known) saveSettings({ verbTenses: [...settings.verbTenses, name] });
  }

  function cancel() {
    // The draft is dropped by the remount on the way back in, so this
    // only has to put the card away — and the page stops it on the way
    // out if there is anything to lose.
    onToggle();
  }

  function save() {
    saveVerbTable(table.id, tenses, rows);
    onFinish();
  }

  return (
    <section
      className={`card px-3 py-2 ${
        // Rolled up, a verb is just its name, so the row is only as wide as
        // it needs to be. Opened, it takes what its columns need.
        open
          ? tenses.length > 1
            ? "w-full max-w-4xl"
            : "w-full max-w-sm"
          : "w-full sm:w-1/2 lg:w-[12.5%] lg:min-w-44"
      }`}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
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

      <div
        id={bodyId}
        hidden={!open}
        className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-800"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 text-xs tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <tr>
                <th scope="col" className="w-28 px-1.5 py-1.5 font-semibold">
                  Person
                </th>
                {tenses.map((tense, at) => (
                  <th key={at} scope="col" className="px-1.5 py-1.5 text-left font-semibold">
                    <span className="flex items-center gap-1">
                      {/* A + on both sides of every tense. The one after a
                          column and the one before the next name the same
                          place to insert, so either reaches it — they sit in
                          separate cells, which is what keeps the pair from
                          reading as one doubled button.

                          "Conjugation" survives for screen readers, which
                          would otherwise meet a column with no name — and a
                          table made before tenses were asked for has none. */}
                      <AddTenseButton
                        at={at}
                        tenses={tenses}
                        disabled={full}
                        onClick={setAdding}
                      />
                      <span className="sr-only">Conjugation</span>
                      {tense && (
                        <strong className="font-bold text-slate-700 dark:text-slate-200">
                          {tense}
                        </strong>
                      )}
                      <AddTenseButton
                        at={at + 1}
                        tenses={tenses}
                        disabled={full}
                        onClick={setAdding}
                      />
                    </span>
                  </th>
                ))}
                <th scope="col" className="w-10 px-1.5 py-1.5 font-semibold">
                  <span className="sr-only">Notes</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowAt) => (
                <RowFields
                  key={rowAt}
                  row={row}
                  columns={tenses}
                  notesShowing={notesOpen === rowAt}
                  onToggleNotes={() => setNotesOpen(notesOpen === rowAt ? null : rowAt)}
                  onCell={(columnAt, value) => editCell(rowAt, columnAt, value)}
                  onNotes={(notes) => editNotes(rowAt, notes)}
                />
              ))}
            </tbody>
          </table>
        </div>

        {adding !== null && (
          <NameTense
            at={adding}
            tenses={tenses}
            known={settings.verbTenses}
            onCancel={() => setAdding(null)}
            onAdd={(name) => addTense(name, adding)}
          />
        )}

        {full && (
          <p className="mt-1 text-[0.7rem] text-slate-500 dark:text-slate-400">
            That is as many tenses as one table holds ({MAX_TENSES}).
          </p>
        )}

        {asking && (
          <div
            role="alert"
            className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-400/10 dark:text-amber-200"
          >
            <span>
              <strong className="font-semibold">{table.verb}</strong> has changes that are
              not saved.
            </span>
            <button
              type="button"
              className="btn btn-primary !px-2 !py-0.5 text-xs"
              onClick={save}
            >
              Save them
            </button>
            <button
              type="button"
              className="btn btn-danger !px-2 !py-0.5 text-xs"
              onClick={onFinish}
            >
              Discard them
            </button>
            <button
              type="button"
              className="btn btn-secondary !px-2 !py-0.5 text-xs"
              onClick={onKeep}
            >
              Keep editing
            </button>
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {confirmingRemove ? (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-slate-600 dark:text-slate-300">
                Delete the table for {table.verb}?
              </span>
              <button
                type="button"
                className="btn btn-danger !px-2 !py-0.5 text-xs"
                onClick={() => {
                  deleteVerbTable(table.id);
                  onFinish();
                }}
              >
                Delete
              </button>
              <button
                type="button"
                className="btn btn-secondary !px-2 !py-0.5 text-xs"
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
            <button
              type="button"
              className="btn btn-secondary !px-2 !py-0.5 text-xs"
              onClick={cancel}
            >
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

/**
 * Says where a new column would land, in words: a bare + repeated across a
 * header row tells a screen reader nothing about which one it is on.
 */
function describeGap(at: number, tenses: string[]): string {
  const before = tenses[at - 1];
  const after = tenses[at];
  if (before && after) return `between ${before} and ${after}`;
  if (after) return `before ${after}`;
  if (before) return `after ${before}`;
  return at === 0 ? "at the start" : "at the end";
}

/** The + in one of the gaps between tense columns, or at either end. */
function AddTenseButton({
  at,
  tenses,
  disabled,
  onClick,
}: {
  at: number;
  tenses: string[];
  disabled: boolean;
  onClick: (at: number) => void;
}) {
  const where = `Add a tense ${describeGap(at, tenses)}`;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onClick(at)}
      aria-label={where}
      title={disabled ? "No room for another tense" : where}
      className="cursor-pointer rounded border border-slate-300 px-1 leading-none text-slate-500 transition hover:border-indigo-400 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-30 dark:border-slate-700 dark:text-slate-400 dark:hover:text-indigo-300"
    >
      +
    </button>
  );
}

/** The dropdown value meaning "none of these, let me type one". */
const ANOTHER = " another";

/**
 * Names the column about to be inserted — the same question the first table
 * asked, offering the same remembered answers.
 */
function NameTense({
  at,
  tenses,
  known,
  onAdd,
  onCancel,
}: {
  at: number;
  tenses: string[];
  known: string[];
  onAdd: (name: string) => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const [choice, setChoice] = useState(known[0] ?? ANOTHER);
  const [typed, setTyped] = useState("");

  const name = (choice === ANOTHER ? typed : choice).trim();

  return (
    <div className="mt-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
      <label htmlFor={ids} className="block text-xs font-medium">
        Which tense goes {describeGap(at, tenses)}?
      </label>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        {known.length > 0 && (
          <select
            id={ids}
            className="field !px-1.5 !py-0.5 w-auto text-xs"
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            {known.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value={ANOTHER}>Another tense…</option>
          </select>
        )}

        {(known.length === 0 || choice === ANOTHER) && (
          <input
            id={known.length === 0 ? ids : undefined}
            autoFocus
            aria-label="A new tense"
            className="field !px-1.5 !py-0.5 w-32 text-xs"
            placeholder="e.g. Past"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        )}

        <button
          type="button"
          className="btn btn-primary !px-2 !py-0.5 text-xs"
          disabled={name === ""}
          onClick={() => onAdd(name)}
        >
          Add
        </button>
        <button
          type="button"
          className="btn btn-secondary !px-2 !py-0.5 text-xs"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** A pen when the row has notes, an outline when it does not. */
function NotesIcon({ written }: { written: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
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
  columns,
  notesShowing,
  onToggleNotes,
  onCell,
  onNotes,
}: {
  row: VerbRow;
  columns: string[];
  notesShowing: boolean;
  onToggleNotes: () => void;
  onCell: (columnAt: number, value: string) => void;
  onNotes: (notes: string) => void;
}) {
  const ids = useId();
  const written = row.notes.trim().length > 0;

  return (
    <>
      <tr>
        <td className="px-1.5 py-1 align-middle font-medium">{row.person}</td>
        {columns.map((tense, at) => (
          <td key={at} className="px-1.5 py-1 align-middle">
            <label htmlFor={`${ids}-${at}`} className="sr-only">
              {tense ? `${tense} for ${row.person}` : `Conjugation for ${row.person}`}
            </label>
            <input
              id={`${ids}-${at}`}
              className="field !px-2 !py-1 text-sm"
              value={row.conjugations[at] ?? ""}
              onChange={(event) => onCell(at, event.target.value)}
            />
          </td>
        ))}
        <td className="px-1.5 py-1 align-middle">
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
          <td colSpan={columns.length + 1} className="px-1.5 pb-2">
            <label htmlFor={`${ids}-notes`} className="sr-only">
              {`Notes for ${row.person}`}
            </label>
            <textarea
              id={`${ids}-notes`}
              rows={2}
              className="field !px-2 !py-1.5 min-h-0 resize-y text-sm"
              placeholder={`Note for ${row.person}`}
              value={row.notes}
              onChange={(event) => onNotes(event.target.value)}
            />
          </td>
        </tr>
      )}
    </>
  );
}
