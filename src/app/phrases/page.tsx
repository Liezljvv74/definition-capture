"use client";

import { useMemo, useState } from "react";

import { AddPhraseDialog } from "@/components/AddPhraseDialog";
import { BackupButtons } from "@/components/BackupButtons";
import {
  ConfirmDeleteDialog,
  RowDeleteButton,
  SelectAllCheckbox,
  SelectionBar,
  SelectRowCheckbox,
} from "@/components/DeleteControls";
import { EditPhraseDialog } from "@/components/EditPhraseDialog";
import { buildLinkIndex, RefText, type LinkIndex } from "@/components/RefText";
import { deletePhrases } from "@/lib/phraseStorage";
import type { Phrase } from "@/lib/types";
import { useGlossary } from "@/lib/useGlossary";
import { useListSelection, type ListSelection } from "@/lib/useListSelection";
import { usePhrases } from "@/lib/usePhrases";

/** null keeps the order phrases were added in, newest first. */
type SortDirection = "asc" | "desc" | null;

const COLUMNS: { label: string; sortable?: boolean; className?: string }[] = [
  { label: "Phrase", sortable: true, className: "w-[24%]" },
  { label: "Literal meaning" },
  { label: "Usage example" },
  { label: "Ref", className: "w-[18%]" },
];

export default function PhrasesPage() {
  const { phrases, loaded } = usePhrases();
  const { entries } = useGlossary();
  const [isAdding, setIsAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortDirection>(null);
  /** The ids the confirmation dialog is currently asking about, or null. */
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);
  /** The phrase the edit dialog is open on, or null. */
  const [editingId, setEditingId] = useState<string | null>(null);

  const linkIndex = useMemo(() => buildLinkIndex(entries, phrases), [entries, phrases]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const filtered = needle
      ? phrases.filter((phrase) =>
          [phrase.phrase, phrase.literalMeaning, phrase.usageExample, phrase.ref].some(
            (field) => field.toLocaleLowerCase().includes(needle),
          ),
        )
      : phrases;

    if (!sort) return filtered;
    return [...filtered].sort((a, b) => {
      const result = a.phrase.localeCompare(b.phrase, undefined, { sensitivity: "base" });
      return sort === "asc" ? result : -result;
    });
  }, [phrases, query, sort]);

  const visibleIds = useMemo(() => visible.map((phrase) => phrase.id), [visible]);
  const selection = useListSelection(visibleIds);

  const editing = editingId
    ? (phrases.find((phrase) => phrase.id === editingId) ?? null)
    : null;

  /** Names in on-screen order, so the dialog lists what the user is looking at. */
  const pendingNames = useMemo(() => {
    if (!pendingDelete) return [];
    const doomed = new Set(pendingDelete);
    return phrases.filter((phrase) => doomed.has(phrase.id)).map((phrase) => phrase.phrase);
  }, [pendingDelete, phrases]);

  return (
    <>
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Phrases</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {!loaded
                ? "Loading your phrases…"
                : phrases.length === 0
                  ? "Expressions worth remembering"
                  : `${phrases.length} ${phrases.length === 1 ? "phrase" : "phrases"}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BackupButtons />
            <button type="button" className="btn btn-primary" onClick={() => setIsAdding(true)}>
              <span aria-hidden="true">+</span> Add phrase
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {!loaded ? (
          <div className="card h-64 animate-pulse" aria-hidden="true" />
        ) : phrases.length === 0 ? (
          <EmptyPhrases onAdd={() => setIsAdding(true)} />
        ) : (
          <>
            <div className="mb-4">
              <label htmlFor="phrase-search" className="sr-only">
                Search phrases
              </label>
              <input
                id="phrase-search"
                type="search"
                className="field"
                placeholder="Search phrases, meanings, examples…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>

            {visible.length === 0 ? (
              <NoMatches onClear={() => setQuery("")} />
            ) : (
              <>
                <p className="sr-only" aria-live="polite">
                  {visible.length} of {phrases.length} phrases shown
                </p>
                {selection.count > 0 && (
                  <SelectionBar
                    count={selection.count}
                    noun="phrase"
                    nounPlural="phrases"
                    onDelete={() => setPendingDelete(selection.selectedIds)}
                    onClear={selection.clear}
                  />
                )}
                <PhraseTable
                  phrases={visible}
                  sort={sort}
                  onToggleSort={() =>
                    setSort((current) =>
                      current === null ? "asc" : current === "asc" ? "desc" : null,
                    )
                  }
                  linkIndex={linkIndex}
                  selection={selection}
                  onEdit={setEditingId}
                  onDelete={(id) => setPendingDelete([id])}
                />
                <PhraseCards
                  phrases={visible}
                  linkIndex={linkIndex}
                  selection={selection}
                  onEdit={setEditingId}
                  onDelete={(id) => setPendingDelete([id])}
                />
                {query.trim() !== "" && (
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Showing {visible.length} of {phrases.length} phrases.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </main>

      {isAdding && <AddPhraseDialog onClose={() => setIsAdding(false)} />}

      {editing && (
        <EditPhraseDialog phrase={editing} onClose={() => setEditingId(null)} />
      )}

      {pendingDelete && pendingNames.length > 0 && (
        <ConfirmDeleteDialog
          names={pendingNames}
          noun="phrase"
          nounPlural="phrases"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            deletePhrases(pendingDelete);
            setPendingDelete(null);
            // Deleted ids leave the selection on their own, because the
            // selection is always intersected with what is on screen.
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ table  */

function PhraseTable({
  phrases,
  sort,
  onToggleSort,
  linkIndex,
  selection,
  onEdit,
  onDelete,
}: {
  phrases: Phrase[];
  sort: SortDirection;
  onToggleSort: () => void;
  linkIndex: LinkIndex;
  selection: ListSelection;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="card hidden overflow-hidden md:block">
      <table className="w-full table-fixed border-collapse text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
          <tr>
            <th scope="col" className="w-10 px-3 py-2.5">
              <SelectAllCheckbox
                checked={selection.allSelected}
                indeterminate={selection.partiallySelected}
                onChange={selection.toggleAll}
                label="Select all phrases shown"
              />
            </th>
            {COLUMNS.map((column) => (
              <th
                key={column.label}
                scope="col"
                className={`px-4 py-2.5 font-semibold ${column.className ?? ""}`}
                aria-sort={
                  column.sortable && sort
                    ? sort === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                {column.sortable ? (
                  <button
                    type="button"
                    onClick={onToggleSort}
                    title={
                      sort === null
                        ? "Sort A to Z"
                        : sort === "asc"
                          ? "Sort Z to A"
                          : "Back to newest first"
                    }
                    className="inline-flex cursor-pointer items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
                  >
                    {column.label}
                    <span aria-hidden="true" className={sort ? "" : "opacity-30"}>
                      {sort === "asc" ? "▲" : "▼"}
                    </span>
                  </button>
                ) : (
                  column.label
                )}
              </th>
            ))}
            <th scope="col" className="w-12 px-3 py-2.5">
              <span className="sr-only">Delete</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {phrases.map((phrase) => {
            const selected = selection.isSelected(phrase.id);
            return (
              <tr
                key={phrase.id}
                className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                  selected ? "bg-indigo-50/80 dark:bg-indigo-500/10" : ""
                }`}
              >
                <td className="px-3 py-3 align-top">
                  <SelectRowCheckbox
                    checked={selected}
                    onChange={() => selection.toggle(phrase.id)}
                    label={phrase.phrase}
                  />
                </td>
                <td className="px-4 py-3 align-top">
                  <button
                    type="button"
                    onClick={() => onEdit(phrase.id)}
                    className="cursor-pointer text-left font-medium text-indigo-700 hover:underline dark:text-indigo-300"
                  >
                    {phrase.phrase}
                  </button>
                </td>
                <td className="px-4 py-3 align-top text-slate-700 dark:text-slate-300">
                  {phrase.literalMeaning ? (
                    <span className="line-clamp-3">{phrase.literalMeaning}</span>
                  ) : (
                    <Dash />
                  )}
                </td>
                <td className="px-4 py-3 align-top text-slate-700 dark:text-slate-300">
                  {phrase.usageExample ? (
                    <span className="line-clamp-3 italic">{phrase.usageExample}</span>
                  ) : (
                    <Dash />
                  )}
                </td>
                <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-400">
                  {phrase.ref ? (
                    <span className="line-clamp-2 break-words">
                      <RefText value={phrase.ref} linkIndex={linkIndex} />
                    </span>
                  ) : (
                    <Dash />
                  )}
                </td>
                <td className="px-3 py-3 align-top">
                  <RowDeleteButton label={phrase.phrase} onClick={() => onDelete(phrase.id)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Dash() {
  return (
    <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
      —
    </span>
  );
}

/* ------------------------------------------------------------------ cards  */

function PhraseCards({
  phrases,
  linkIndex,
  selection,
  onEdit,
  onDelete,
}: {
  phrases: Phrase[];
  linkIndex: LinkIndex;
  selection: ListSelection;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="md:hidden">
      <label className="mb-3 flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-600 select-none dark:text-slate-300">
        <SelectAllCheckbox
          checked={selection.allSelected}
          indeterminate={selection.partiallySelected}
          onChange={selection.toggleAll}
          label="Select all phrases shown"
        />
        Select all
      </label>

      <ul className="space-y-3">
        {phrases.map((phrase) => {
          const selected = selection.isSelected(phrase.id);
          return (
            <li key={phrase.id}>
              <div
                className={`card p-4 transition hover:border-indigo-300 dark:hover:border-indigo-500/50 ${
                  selected ? "border-indigo-400 bg-indigo-50/60 dark:bg-indigo-500/10" : ""
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span className="pt-1">
                    <SelectRowCheckbox
                      checked={selected}
                      onChange={() => selection.toggle(phrase.id)}
                      label={phrase.phrase}
                    />
                  </span>
                  <h2 className="flex-1 font-semibold">
                    <button
                      type="button"
                      onClick={() => onEdit(phrase.id)}
                      className="cursor-pointer text-left text-indigo-700 hover:underline dark:text-indigo-300"
                    >
                      {phrase.phrase}
                    </button>
                  </h2>
                  <RowDeleteButton
                    label={phrase.phrase}
                    onClick={() => onDelete(phrase.id)}
                    className="-mt-1 -mr-1"
                  />
                </div>
                {phrase.literalMeaning && (
                  <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300">
                    {phrase.literalMeaning}
                  </p>
                )}
                {phrase.usageExample && (
                  <p className="mt-1.5 text-sm text-slate-600 italic dark:text-slate-400">
                    “{phrase.usageExample}”
                  </p>
                )}
                {phrase.ref && (
                  <p className="mt-2 text-xs break-words text-slate-600 dark:text-slate-400">
                    <span className="font-medium text-slate-500 dark:text-slate-500">Ref: </span>
                    <RefText value={phrase.ref} linkIndex={linkIndex} />
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------- empty states */

function EmptyPhrases({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="card mx-auto max-w-xl p-8 text-center">
      <div aria-hidden="true" className="mb-3 text-4xl">
        💬
      </div>
      <h2 className="text-lg font-semibold">No phrases yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
        Phrases are the multi-word expressions that do not fit a single glossary term — idioms,
        set phrases, turns of speech. Save the wording now and fill in what it means and how it
        is used whenever you like.
      </p>
      <button type="button" className="btn btn-primary mt-5" onClick={onAdd}>
        <span aria-hidden="true">+</span> Add your first phrase
      </button>
    </div>
  );
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="card p-8 text-center">
      <h2 className="font-semibold">No phrases match that search</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Try different wording.</p>
      <button type="button" className="btn btn-secondary mt-4" onClick={onClear}>
        Clear search
      </button>
    </div>
  );
}
