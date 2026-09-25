"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import { AddWordDialog } from "@/components/AddWordDialog";
import { CollectionBadge, NeedsDefinitionBadge } from "@/components/Badges";
import {
  ConfirmDeleteDialog,
  RowDeleteButton,
  SelectAllCheckbox,
  SelectionBar,
  SelectRowCheckbox,
} from "@/components/DeleteControls";
import { EditWordDialog } from "@/components/EditWordDialog";
import { buildLinkIndex, RefText, type LinkIndex } from "@/components/RefText";
import { EmptyCell } from "@/components/EmptyCell";
import { STICKY_FILTERS } from "@/components/StickyFilters";
import { RowEditButton } from "@/components/RowEditButton";
import { deleteEntries } from "@/lib/storage";
import type { Entry } from "@/lib/types";
import { collectionOptions } from "@/lib/collectionOptions";
import { foldName } from "@/lib/foldName";
import { useWords } from "@/lib/useWords";
import { useWideScreen } from "@/lib/useWideScreen";
import { useListPage } from "@/lib/useListPage";
import { type ListSelection } from "@/lib/useListSelection";
import type { Sorting } from "@/lib/sortName";
import { usePhrases } from "@/lib/usePhrases";
import { useSorting } from "@/lib/useSorting";

type SortKey = "word" | "definition" | "dateAdded";
type SortDirection = "asc" | "desc";
type Sort = { key: SortKey; direction: SortDirection };

const COLUMNS: { key: SortKey | null; label: string; className?: string }[] = [
  { key: "word", label: "Word", className: "w-[22%]" },
  { key: "definition", label: "Definition" },
  { key: null, label: "Collection", className: "w-[14%]" },
  { key: null, label: "Ref", className: "w-[20%]" },
];

/** Module scope so their identity is stable across renders; `useListPage`
 *  memoises against them. */
const idOfEntry = (entry: Entry) => entry.id;
const nameOfEntry = (entry: Entry) => entry.word;

function compare(a: Entry, b: Entry, key: SortKey, sorting: Sorting): number {
  switch (key) {
    case "word":
      return sorting.compareNames(a.word, b.word);
    case "definition":
      // No article convention here, and a word still waiting for its
      // definition sorts to the top of the ascending list, which is where
      // you would go looking for it.
      return sorting.compareText(a.definition, b.definition);
    case "dateAdded":
      return a.dateAdded.localeCompare(b.dateAdded);
  }
}

export default function VocabularyPage() {
  const { entries, loaded } = useWords();
  const wide = useWideScreen();
  const { phrases } = usePhrases();
  const sorting = useSorting();
  const [isAdding, setIsAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [onlyNeedsDefinition, setOnlyNeedsDefinition] = useState(false);
  /** Empty means every collection; otherwise the one being shown. */
  const [collection, setCollection] = useState("");
  // Alphabetical by word, looking past a leading word from the skip list in
  // Settings, so nouns saved with their article file under their own first
  // letter. Date added is no longer a column and is now only the tie-breaker.
  const [sort, setSort] = useState<Sort>({ key: "word", direction: "asc" });

  /** See `collectionOptions`: in use only, plus whatever is being filtered by. */
  const collections = useMemo(
    () => collectionOptions(entries, collection, sorting.compareText),
    [entries, collection, sorting],
  );

  /**
   * Sorting and filtering are two memos, not one, and the split is what keeps
   * typing in the search box quick.
   *
   * Sorting is the expensive half — a comparator over the whole list, run
   * O(n log n) times — and it does not depend on the query at all. Together in
   * one memo, every keystroke re-sorted everything; apart, a keystroke only
   * re-runs the filter, which is a single linear pass. `filter` preserves
   * order, so the result is exactly what it was before.
   */
  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => {
      const result = compare(a, b, sort.key, sorting);
      if (result !== 0) return sort.direction === "asc" ? result : -result;
      // Ties fall back to newest-first so the order is always stable.
      return b.dateAdded.localeCompare(a.dateAdded);
    });
    // `sorting` is here so the list re-sorts when settings arrive after the
    // first render, or the language changes; it keeps its identity otherwise.
  }, [entries, sort, sorting]);

  /**
   * The list filters on a deferred copy of the query, not the live one.
   *
   * The filter itself is cheap, well under a millisecond over a few thousand
   * rows. Rendering the result is not: a row is about thirty elements, so a
   * thousand of them is a hundred milliseconds or more of reconciliation, and
   * doing that synchronously on every keystroke is what made typing feel
   * sticky. React keeps the input on the live value and re-renders the list at
   * low priority, abandoning the work if another key arrives first.
   */
  const deferredQuery = useDeferredValue(query);

  const visible = useMemo(() => {
    const needle = foldName(deferredQuery);
    const wanted = foldName(collection);
    return sorted.filter((entry) => {
      if (onlyNeedsDefinition && !entry.needsDefinition) return false;
      if (wanted && !entry.collections.some((name) => foldName(name) === wanted)) {
        return false;
      }
      if (!needle) return true;
      return (
        foldName(entry.word).includes(needle) ||
        foldName(entry.definition).includes(needle) ||
        foldName(entry.ref).includes(needle)
      );
    });
  }, [sorted, deferredQuery, onlyNeedsDefinition, collection]);

  // Selection, the row being edited, and the names the delete dialog lists —
  // the four pieces the phrase page also needs, and the ones where the two
  // drifting apart would be a bug rather than a choice.
  const {
    selection,
    editing,
    setEditingId,
    pendingDelete,
    setPendingDelete,
    pendingNames,
  } = useListPage(visible, idOfEntry, nameOfEntry);

  const linkIndex = useMemo(() => buildLinkIndex(entries, phrases), [entries, phrases]);
  const missingCount = entries.filter((entry) => entry.needsDefinition).length;
  const isFiltered = query.trim() !== "" || onlyNeedsDefinition || collection !== "";

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "dateAdded" ? "desc" : "asc" },
    );
  }

  return (
    <>
      <header className="bg-card-blue">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              Vocabulary
            </h1>
            <p className="mt-0.5 text-sm text-slate-700">
              {!loaded
                ? "Loading your vocabulary…"
                : entries.length === 0
                  ? "Your personal word list"
                  : `${entries.length} ${entries.length === 1 ? "word" : "words"}${
                      missingCount > 0
                        ? ` · ${missingCount} still ${
                            missingCount === 1 ? "needs" : "need"
                          } a definition`
                        : ""
                    }`}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {!loaded ? (
          <div className="card h-64 animate-pulse" aria-hidden="true" />
        ) : entries.length === 0 ? (
          <EmptyVocabulary onAdd={() => setIsAdding(true)} />
        ) : (
          <>
            <div
              className={`${STICKY_FILTERS} mb-4 flex flex-wrap items-center gap-2`}
            >
              {/*
               * A bounded width rather than `flex-1`. Letting the search take
               * every spare pixel is what pushed the Add button off the end of
               * the row: this list has the most controls of the four, so the
               * field that can afford to be smaller is the one that grows.
               */}
              <div className="w-full sm:w-1/3 lg:min-w-64">
                <label htmlFor="search" className="sr-only">
                  Search words and definitions
                </label>
                <input
                  id="search"
                  type="search"
                  className="field"
                  placeholder="Search words and definitions…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>

              {/* Width sits on the wrapper, not the select: `field` already sets
                  w-full, and two utilities of equal weight would be a coin toss. */}
              {collections.length > 0 && (
                <div className="w-full sm:w-44">
                  <label htmlFor="collection" className="sr-only">
                    Filter by collection
                  </label>
                  <select
                    id="collection"
                    className="field"
                    value={collection}
                    onChange={(event) => setCollection(event.target.value)}
                  >
                    <option value="">All collections</option>
                    {collections.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-slate-600 select-none dark:text-slate-300">
                <input
                  type="checkbox"
                  className="size-4 accent-indigo-600"
                  checked={onlyNeedsDefinition}
                  onChange={(event) => setOnlyNeedsDefinition(event.target.checked)}
                />
                Needs definition
              </label>

              {/* Last in the row and pushed to the end, so the controls that
                  narrow the list read left to right and the one that adds to
                  it sits apart from them. */}
              <button
                type="button"
                className="btn btn-primary shrink-0 sm:ml-auto"
                onClick={() => setIsAdding(true)}
              >
                <span aria-hidden="true">+</span> Add word
              </button>
            </div>

            {visible.length === 0 ? (
              <NoMatches
                onClear={() => {
                  setQuery("");
                  setOnlyNeedsDefinition(false);
                  setCollection("");
                }}
              />
            ) : (
              <>
                <p className="sr-only" aria-live="polite">
                  {visible.length} of {entries.length} words shown
                </p>
                {selection.count > 0 && (
                  <SelectionBar
                    count={selection.count}
                    noun="word"
                    nounPlural="words"
                    onDelete={() => setPendingDelete(selection.selectedIds)}
                    onClear={selection.clear}
                  />
                )}
                {/* One of the two, once the viewport is known; both, with CSS
                    choosing, until then. See `useWideScreen`. */}
                {wide !== false && (
                  <EntryTable
                    entries={visible}
                    sort={sort}
                    onSort={toggleSort}
                    onSelectCollection={setCollection}
                    linkIndex={linkIndex}
                    selection={selection}
                    onEdit={setEditingId}
                    onDelete={(id) => setPendingDelete([id])}
                  />
                )}
                {wide !== true && (
                  <EntryCards
                    entries={visible}
                    onSelectCollection={setCollection}
                    linkIndex={linkIndex}
                    selection={selection}
                    onEdit={setEditingId}
                    onDelete={(id) => setPendingDelete([id])}
                  />
                )}
                {isFiltered && (
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Showing {visible.length} of {entries.length} words.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </main>

      {isAdding && <AddWordDialog onClose={() => setIsAdding(false)} />}

      {editing && <EditWordDialog entry={editing} onClose={() => setEditingId(null)} />}

      {pendingDelete && pendingNames.length > 0 && (
        <ConfirmDeleteDialog
          names={pendingNames}
          noun="word"
          nounPlural="words"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            deleteEntries(pendingDelete);
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

function EntryTable({
  entries,
  sort,
  onSort,
  onSelectCollection,
  linkIndex,
  selection,
  onEdit,
  onDelete,
}: {
  entries: Entry[];
  sort: Sort;
  onSort: (key: SortKey) => void;
  onSelectCollection: (name: string) => void;
  linkIndex: LinkIndex;
  selection: ListSelection;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="card hidden overflow-hidden md:block">
      <table className="w-full table-fixed border-collapse text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
          <tr>
            <th scope="col" className="w-10 px-3 py-2.5">
              <SelectAllCheckbox
                checked={selection.allSelected}
                indeterminate={selection.partiallySelected}
                onChange={selection.toggleAll}
                label="Select all words shown"
              />
            </th>
            {COLUMNS.map((column) => {
              const active = column.key !== null && sort.key === column.key;
              return (
                <th
                  key={column.label}
                  scope="col"
                  className={`px-4 py-2.5 font-semibold ${column.className ?? ""}`}
                  aria-sort={
                    active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"
                  }
                >
                  {column.key === null ? (
                    column.label
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSort(column.key as SortKey)}
                      className="inline-flex cursor-pointer items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100"
                    >
                      {column.label}
                      <span aria-hidden="true" className={active ? "" : "opacity-30"}>
                        {active && sort.direction === "asc" ? "▲" : "▼"}
                      </span>
                    </button>
                  )}
                </th>
              );
            })}
            <th scope="col" className="w-24 px-3 py-2.5">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {entries.map((entry) => {
            const selected = selection.isSelected(entry.id);
            return (
              <tr
                key={entry.id}
                className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                  selected
                    ? "bg-indigo-50/80 dark:bg-indigo-500/10"
                    : entry.needsDefinition
                      ? "bg-amber-50/70 dark:bg-amber-400/5"
                      : ""
                }`}
              >
                <td className="px-3 py-3 align-top">
                  <SelectRowCheckbox
                    checked={selected}
                    onChange={() => selection.toggle(entry.id)}
                    label={entry.word}
                  />
                </td>
                <td className="px-4 py-3 align-top">
                  {/* The name opens the word, it does not edit it. Reading is
                      what somebody is doing when they scan a list and stop at
                      a row; editing is a decision, and it has the pencil at
                      the end of the row and the Edit button on the page
                      itself. It was the edit dialog until a click here meant
                      being handed a form to escape from. */}
                  <Link
                    href={`/word?id=${entry.id}`}
                    className="font-medium text-indigo-700 hover:underline dark:text-indigo-300"
                  >
                    {entry.word}
                  </Link>
                </td>
                <td className="px-4 py-3 align-top text-slate-700 dark:text-slate-300">
                  {entry.needsDefinition ? (
                    <NeedsDefinitionBadge />
                  ) : (
                    <span className="line-clamp-3">{entry.definition}</span>
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  {entry.collections.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {entry.collections.map((name) => (
                        <CollectionBadge key={name} name={name} onSelect={onSelectCollection} />
                      ))}
                    </div>
                  ) : (
                    <EmptyCell />
                  )}
                </td>
                <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-400">
                  {entry.ref ? (
                    <span className="line-clamp-3 break-words">
                      <RefText value={entry.ref} linkIndex={linkIndex} />
                    </span>
                  ) : (
                    <EmptyCell />
                  )}
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="flex items-center justify-end gap-0.5">
                    <RowEditButton label={entry.word} onClick={() => onEdit(entry.id)} />
                    <RowDeleteButton label={entry.word} onClick={() => onDelete(entry.id)} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ cards  */

function EntryCards({
  entries,
  onSelectCollection,
  linkIndex,
  selection,
  onEdit,
  onDelete,
}: {
  entries: Entry[];
  onSelectCollection: (name: string) => void;
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
          label="Select all words shown"
        />
        Select all
      </label>

      <ul className="space-y-3">
        {entries.map((entry) => {
          const selected = selection.isSelected(entry.id);
          return (
            <li key={entry.id}>
              {/* A plain card, not a link — the Ref field may contain its own links,
                  and an anchor cannot be nested inside another anchor. */}
              <div
                className={`card p-4 transition hover:border-indigo-300 dark:hover:border-indigo-500/50 ${
                  selected ? "border-indigo-400 bg-indigo-50/60 dark:bg-indigo-500/10" : ""
                } ${entry.needsDefinition ? "border-l-4 border-l-amber-400" : ""}`}
              >
                <div className="flex items-start gap-2.5">
                  <span className="pt-1">
                    <SelectRowCheckbox
                      checked={selected}
                      onChange={() => selection.toggle(entry.id)}
                      label={entry.word}
                    />
                  </span>
                  <h2 className="flex-1 font-semibold">
                    <Link
                      href={`/word?id=${entry.id}`}
                      className="text-indigo-700 hover:underline dark:text-indigo-300"
                    >
                      {entry.word}
                    </Link>
                  </h2>
                  {entry.needsDefinition && <NeedsDefinitionBadge />}
                  <div className="-mt-1 -mr-1 flex shrink-0 items-center gap-0.5">
                    <RowEditButton label={entry.word} onClick={() => onEdit(entry.id)} />
                    <RowDeleteButton label={entry.word} onClick={() => onDelete(entry.id)} />
                  </div>
                </div>
                {entry.definition && (
                  <p className="mt-1.5 line-clamp-3 text-sm text-slate-700 dark:text-slate-300">
                    {entry.definition}
                  </p>
                )}
                {entry.ref && (
                  <p className="mt-2 text-xs break-words text-slate-600 dark:text-slate-400">
                    <span className="font-medium text-slate-500 dark:text-slate-500">Ref: </span>
                    <RefText value={entry.ref} linkIndex={linkIndex} />
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {entry.collections.map((name) => (
                    <CollectionBadge key={name} name={name} onSelect={onSelectCollection} />
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------- empty states */

function EmptyVocabulary({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="card mx-auto max-w-xl p-8 text-center">
      <div aria-hidden="true" className="mb-3 text-4xl">
        📖
      </div>
      <h2 className="text-lg font-semibold">No words yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
        Definition Capture is a place to park the words and concepts you meet while studying, so
        you can search and review them later. Save a word now and write the definition whenever
        you like. Blank ones get flagged so they are easy to find again.
      </p>
      <button type="button" className="btn btn-primary mt-5" onClick={onAdd}>
        <span aria-hidden="true">+</span> Add your first word
      </button>
    </div>
  );
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="card p-8 text-center">
      <h2 className="font-semibold">No words match those filters</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        Try a different search, or clear the filters below.
      </p>
      <button type="button" className="btn btn-secondary mt-4" onClick={onClear}>
        Clear filters
      </button>
    </div>
  );
}
