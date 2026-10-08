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
import { RefText } from "@/components/RefText";
import { EmptyCell } from "@/components/EmptyCell";
import {
  CollectionFilter,
  EmptyState,
  ListShell,
  NoMatches,
  ROW_CONTROL,
  ROW_TEXT,
  SortHeader,
} from "@/components/ListPage";
import { STICKY_FILTERS } from "@/components/StickyFilters";
import { RowEditButton } from "@/components/RowEditButton";
import { SpeakButton } from "@/components/SpeakButton";
import { deleteEntries } from "@/lib/storage";
import type { LinkIndex } from "@/lib/links";
import type { Entry } from "@/lib/types";
import { collectionOptions } from "@/lib/collectionOptions";
import { foldName } from "@/lib/foldName";
import { plural } from "@/lib/home";
import { useLinkTargets } from "@/lib/useLinkTargets";
import { useWords } from "@/lib/useWords";
import { useWideScreen } from "@/lib/useWideScreen";
import { useListPage } from "@/lib/useListPage";
import { type ListSelection } from "@/lib/useListSelection";
import type { Sorting } from "@/lib/sortName";
import { useSorting } from "@/lib/useSorting";
import { studiedParts } from "@/lib/speech";

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
   * Sorting is the expensive half: a comparator over the whole list, run
   * O(n log n) times, and it does not depend on the query at all. Together in
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

  // Selection, the row being edited, and the names the delete dialog lists,
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
      <ListShell
        title="Vocabulary"
        marker="section-blue"
        subtitle={
          !loaded
            ? "Loading your vocabulary…"
            : entries.length === 0
              ? "Your personal word list"
              : `${plural(entries.length, "word", "words")}${
                  missingCount > 0
                    ? ` · ${missingCount} still ${missingCount === 1 ? "needs" : "need"} a definition`
                    : ""
                }`
        }
      >
        {!loaded ? (
          <div className="card h-64 animate-pulse" aria-hidden="true" />
        ) : entries.length === 0 ? (
          <EmptyState
            doodle="star"
            tilt="-0.8deg"
            icon="📖"
            title="No words yet"
            action={<><span aria-hidden="true">+</span> Add your first word</>}
            onAction={() => setIsAdding(true)}
          >
            Captured is a place to park the words and concepts you meet while studying, so
            you can search and review them later. Save a word now and write the definition whenever
            you like. Blank ones get flagged so they are easy to find again.
          </EmptyState>
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

              <CollectionFilter
                id="collection"
                collections={collections}
                value={collection}
                onChange={setCollection}
              />

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
                noun="word"
                hint="Try a different search, or clear the filters below."
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
                <SelectionBar selection={selection} noun="word" onDelete={setPendingDelete} />
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
      </ListShell>

      {isAdding && <AddWordDialog onClose={() => setIsAdding(false)} />}

      {editing && <EditWordDialog entry={editing} onClose={() => setEditingId(null)} />}

      {pendingDelete && pendingNames.length > 0 && (
        <ConfirmDeleteDialog
          names={pendingNames}
          noun="word"
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
              <SelectAllCheckbox selection={selection} noun="word" />
            </th>
            {COLUMNS.map(({ key, label, className }) => (
              <SortHeader
                key={label}
                label={label}
                className={className}
                direction={key !== null && sort.key === key ? sort.direction : null}
                onSort={key === null ? undefined : () => onSort(key)}
              />
            ))}
            <th scope="col" className={`w-32 ${ROW_CONTROL}`}>
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
                    <SpeakButton speechKey={`word:${entry.id}`} label={entry.word} parts={() => studiedParts(entry.word)} />
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
  selection,
  onEdit,
  onDelete,
}: {
  entries: Entry[];
  selection: ListSelection;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    // The phone list is written on the paper too, one ruled line (32px) per
    // word: the word, then its meaning beside it, as a glossary is written by
    // hand. Both are cut off when long; the word's own page has everything,
    // including the Ref and collections this narrow line leaves out.
    <div data-ruled-snap className="leading-8 md:hidden">
      <label className="flex h-8 w-fit cursor-pointer items-center gap-2 text-sm text-ink-soft select-none">
        <SelectAllCheckbox selection={selection} noun="word" />
        Select all
      </label>

      <ul>
        {entries.map((entry) => {
          const selected = selection.isSelected(entry.id);
          return (
            <li
              key={entry.id}
              className={`flex h-8 items-center gap-2 text-sm ${selected ? "bg-tile-blue/60" : ""} ${
                entry.needsDefinition ? "border-l-4 border-l-amber-400 pl-1.5" : ""
              }`}
            >
              <SelectRowCheckbox
                checked={selected}
                onChange={() => selection.toggle(entry.id)}
                label={entry.word}
              />
              <h2 className="max-w-[45%] shrink-0 truncate font-semibold">
                <Link href={`/word?id=${entry.id}`} className="text-link hover:underline">
                  {entry.word}
                </Link>
              </h2>
              <span className="min-w-0 flex-1 truncate text-ink-soft">
                {entry.needsDefinition ? <NeedsDefinitionBadge /> : entry.definition}
              </span>
              <div className="-mr-1 flex shrink-0 items-center">
                <SpeakButton speechKey={`word:${entry.id}`} label={entry.word} parts={() => studiedParts(entry.word)} />
                <RowEditButton label={entry.word} onClick={() => onEdit(entry.id)} />
                <RowDeleteButton label={entry.word} onClick={() => onDelete(entry.id)} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
