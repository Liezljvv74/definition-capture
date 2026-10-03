"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState, type CSSProperties } from "react";

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
import { RefText } from "@/components/RefText";
import { EmptyCell } from "@/components/EmptyCell";
import { STICKY_FILTERS } from "@/components/StickyFilters";
import { RowEditButton } from "@/components/RowEditButton";
import { deleteEntries } from "@/lib/storage";
import type { LinkIndex } from "@/lib/links";
import type { Entry } from "@/lib/types";
import { collectionOptions } from "@/lib/collectionOptions";
import { foldName } from "@/lib/foldName";
import { useLinkTargets } from "@/lib/useLinkTargets";
import { useWords } from "@/lib/useWords";
import { useWideScreen } from "@/lib/useWideScreen";
import { useListPage } from "@/lib/useListPage";
import { type ListSelection } from "@/lib/useListSelection";
import type { Sorting } from "@/lib/sortName";
import { useSorting } from "@/lib/useSorting";

type SortKey = "word" | "definition" | "dateAdded";
type SortDirection = "asc" | "desc";
type Sort = { key: SortKey; direction: SortDirection };

/*
 * A row is one line of the paper's ruling, 32px. Text sits low in it, on the
 * line; checkboxes and buttons are centred. Nothing in a row may be taller,
 * or every row below it slips off its line.
 */
const ROW_TEXT = "h-8 px-3 pt-1 pb-0 leading-7 align-top";
const ROW_CONTROL = "h-8 px-2 py-0 align-middle";

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

  const { linkIndex } = useLinkTargets();
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
      <header className="notebook-page mx-auto w-full max-w-6xl pt-6 sm:pt-8">
        <div>
          <h1 className="hand-title text-2xl sm:text-3xl">
            <span className="marker section-blue">Vocabulary</span>
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
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
      </header>

      <main className="notebook-page mx-auto w-full max-w-6xl flex-1 py-6">
        {!loaded ? (
          <div className="card h-64 animate-pulse" aria-hidden="true" />
        ) : entries.length === 0 ? (
          <EmptyVocabulary onAdd={() => setIsAdding(true)} />
        ) : (
          <>
            <div
              className={`${STICKY_FILTERS} flex flex-wrap items-center gap-2`}
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

              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-ink-soft select-none">
                <input
                  type="checkbox"
                  className="size-4 accent-accent"
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
                  <p className="mt-3 text-xs text-ink-soft">
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
    // Written on the paper rather than boxed: no card, no borders, and every
    // row exactly one line of the ruling (32px), so the words sit on the
    // lines. A border or a second line of text would push every row below it
    // off its line, which is why the definition and ref are cut to one line;
    // the word's own page shows them in full. `data-ruled-snap` lets
    // `RuledLines` move the table's top onto a line.
    <div data-ruled-snap className="hidden md:block">
      <table className="w-full table-fixed border-collapse text-left font-hand text-[1.05rem]">
        <thead className="text-ink">
          <tr>
            <th scope="col" className={`w-10 ${ROW_CONTROL}`}>
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
                  className={`hand-title ${ROW_TEXT} ${column.className ?? ""}`}
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
                      className="inline-flex cursor-pointer items-center gap-1 hover:underline"
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
            <th scope="col" className={`w-24 ${ROW_CONTROL}`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const selected = selection.isSelected(entry.id);
            return (
              <tr
                key={entry.id}
                // Washes, not fills, so the ruling still shows through.
                className={`transition-colors hover:bg-marker/20 ${
                  selected
                    ? "bg-tile-blue/60"
                    : entry.needsDefinition
                      ? "bg-amber-50/70 dark:bg-amber-400/5"
                      : ""
                }`}
              >
                <td className={ROW_CONTROL}>
                  <SelectRowCheckbox
                    checked={selected}
                    onChange={() => selection.toggle(entry.id)}
                    label={entry.word}
                  />
                </td>
                <td className={`${ROW_TEXT} truncate`}>
                  {/* The name opens the word, it does not edit it. Reading is
                      what somebody is doing when they scan a list and stop at
                      a row; editing is a decision, and it has the pencil at
                      the end of the row and the Edit button on the page
                      itself. It was the edit dialog until a click here meant
                      being handed a form to escape from. */}
                  <Link
                    href={`/word?id=${entry.id}`}
                    className="font-medium text-link hover:underline"
                  >
                    {entry.word}
                  </Link>
                </td>
                <td className={`${ROW_TEXT} truncate text-ink`} title={entry.definition || undefined}>
                  {entry.needsDefinition ? <NeedsDefinitionBadge /> : entry.definition}
                </td>
                <td className={ROW_TEXT}>
                  {entry.collections.length > 0 ? (
                    <div className="flex gap-1 overflow-hidden">
                      {entry.collections.map((name) => (
                        <CollectionBadge key={name} name={name} onSelect={onSelectCollection} />
                      ))}
                    </div>
                  ) : (
                    <EmptyCell />
                  )}
                </td>
                <td className={`${ROW_TEXT} truncate text-ink-soft`}>
                  {entry.ref ? (
                    <span>
                      <RefText value={entry.ref} linkIndex={linkIndex} />
                    </span>
                  ) : (
                    <EmptyCell />
                  )}
                </td>
                <td className={ROW_CONTROL}>
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
    // The phone list is written on the paper too: every line of an entry is
    // one line of the ruling (32px), so the entries stay on the lines all the
    // way down. Each text size repeats `leading-8`, because Tailwind's size
    // classes bring their own line height.
    <div data-ruled-snap className="leading-8 md:hidden">
      <label className="flex h-8 w-fit cursor-pointer items-center gap-2 text-sm text-ink-soft select-none">
        <SelectAllCheckbox
          checked={selection.allSelected}
          indeterminate={selection.partiallySelected}
          onChange={selection.toggleAll}
          label="Select all words shown"
        />
        Select all
      </label>

      <ul>
        {entries.map((entry) => {
          const selected = selection.isSelected(entry.id);
          return (
            <li
              key={entry.id}
              className={`${selected ? "bg-tile-blue/60" : ""} ${
                entry.needsDefinition ? "border-l-4 border-l-amber-400 pl-2" : ""
              }`}
            >
              {/* Not a link as a whole: the Ref field may contain its own
                  links, and an anchor cannot be nested inside another. */}
              <div className="flex h-8 items-center gap-2.5">
                <SelectRowCheckbox
                  checked={selected}
                  onChange={() => selection.toggle(entry.id)}
                  label={entry.word}
                />
                <h2 className="min-w-0 flex-1 truncate font-semibold">
                  <Link href={`/word?id=${entry.id}`} className="text-link hover:underline">
                    {entry.word}
                  </Link>
                </h2>
                {entry.needsDefinition && <NeedsDefinitionBadge />}
                <div className="-mr-1 flex shrink-0 items-center gap-0.5">
                  <RowEditButton label={entry.word} onClick={() => onEdit(entry.id)} />
                  <RowDeleteButton label={entry.word} onClick={() => onDelete(entry.id)} />
                </div>
              </div>
              {entry.definition && <p className="line-clamp-2 text-sm leading-8 text-ink">{entry.definition}</p>}
              {entry.ref && (
                <p className="truncate text-xs leading-8 text-ink-soft">
                  <span className="font-medium">Ref: </span>
                  <RefText value={entry.ref} linkIndex={linkIndex} />
                </p>
              )}
              {entry.collections.length > 0 && (
                <div className="flex h-8 items-center gap-1.5 overflow-hidden">
                  {entry.collections.map((name) => (
                    <CollectionBadge key={name} name={name} onSelect={onSelectCollection} />
                  ))}
                </div>
              )}
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
    <div
      data-doodle="star"
      className="paste tape tape-centre mx-auto max-w-xl rounded-[6px_14px_8px_12px] border-[3px] border-ink bg-card p-8 text-center shadow-[4px_5px_0_var(--color-shadow)]"
      style={{ "--r": "-0.8deg" } as CSSProperties}
    >
      <div aria-hidden="true" className="mb-3 text-4xl">
        📖
      </div>
      <h2 className="hand-title text-xl">No words yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
        Captured is a place to park the words and concepts you meet while studying, so
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
      <h2 className="hand-title text-lg">No words match those filters</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Try a different search, or clear the filters below.
      </p>
      <button type="button" className="btn btn-secondary mt-4" onClick={onClear}>
        Clear filters
      </button>
    </div>
  );
}
