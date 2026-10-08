"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import { AddPhraseDialog } from "@/components/AddPhraseDialog";
import { CollectionBadge } from "@/components/Badges";
import {
  ConfirmDeleteDialog,
  RowDeleteButton,
  SelectAllCheckbox,
  SelectionBar,
  SelectRowCheckbox,
} from "@/components/DeleteControls";
import { EditPhraseDialog } from "@/components/EditPhraseDialog";
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
import { deletePhrases } from "@/lib/phraseStorage";
import { collectionOptions } from "@/lib/collectionOptions";
import { foldName } from "@/lib/foldName";
import { plural } from "@/lib/home";
import type { LinkIndex } from "@/lib/links";
import type { Phrase } from "@/lib/types";
import { useLinkTargets } from "@/lib/useLinkTargets";
import { useListPage } from "@/lib/useListPage";
import { type ListSelection } from "@/lib/useListSelection";
import { usePhrases } from "@/lib/usePhrases";
import { useSorting } from "@/lib/useSorting";
import { useWideScreen } from "@/lib/useWideScreen";
import { studiedParts } from "@/lib/speech";

/** Module scope so their identity is stable across renders; `useListPage`
 *  memoises against them. */
const idOfPhrase = (phrase: Phrase) => phrase.id;
const nameOfPhrase = (phrase: Phrase) => phrase.phrase;

type PhraseSortKey = "phrase" | "literalMeaning";
/** null keeps the order phrases were added in, newest first. */
type PhraseSort = { key: PhraseSortKey; direction: "asc" | "desc" } | null;

const COLUMNS: { key?: PhraseSortKey; label: string; className?: string }[] = [
  // Phrase takes the most now that every row is one line: a phrase cut off is
  // the one thing in the row that cannot be guessed at. It was 16% when the
  // meaning and example wrapped as paragraphs.
  { key: "phrase", label: "Phrase", className: "w-[26%]" },
  // Literal Meaning and Usage Example are both left unsized on purpose, so
  // they split whatever is left in equal halves. Pinning one of them would
  // hand the whole remainder to the other, which is what a first attempt at
  // this did: it cut Usage Example to 188px while widening its neighbour.
  { key: "literalMeaning", label: "Literal Meaning" },
  { label: "Usage Example" },
  { label: "Collection", className: "w-[10%]" },
  { label: "Ref", className: "w-[12%]" },
];

export default function PhrasesPage() {
  const { phrases, loaded } = usePhrases();
  const wide = useWideScreen();
  const sorting = useSorting();
  const [isAdding, setIsAdding] = useState(false);
  const [query, setQuery] = useState("");
  /** Empty means every collection; otherwise the one being shown. */
  const [collection, setCollection] = useState("");
  const [sort, setSort] = useState<PhraseSort>(null);

  /** The same rule the vocabulary page uses; see `collectionOptions`. */
  const collections = useMemo(
    () => collectionOptions(phrases, collection, sorting.compareText),
    [phrases, collection, sorting],
  );

  const { linkIndex } = useLinkTargets();

  /** Deferred for the reason the vocabulary page gives: the filter is cheap
      and rendering its result is not. */
  const deferredQuery = useDeferredValue(query);

  /**
   * Two memos rather than one, the shape the Vocabulary page arrived at and
   * for the reason written out there: sorting is the O(n log n) half and it
   * does not depend on the query, so keeping them together re-sorted the whole
   * list on every keystroke. `filter` preserves order, so the result is the
   * same list in the same order it used to be.
   */
  const sorted = useMemo(() => {
    if (!sort) return phrases;
    return [...phrases].sort((a, b) => {
      const result =
        sort.key === "phrase"
          ? sorting.compareText(a.phrase, b.phrase)
          : sorting.compareText(a.literalMeaning, b.literalMeaning);
      if (result !== 0) return sort.direction === "asc" ? result : -result;
      // Phrases with nothing written yet would otherwise shuffle about, so
      // ties keep the newest-first order the list has underneath.
      return 0;
    });
  }, [phrases, sort, sorting]);

  const visible = useMemo(() => {
    const needle = foldName(deferredQuery);
    const wanted = foldName(collection);
    return sorted.filter((phrase) => {
      if (wanted && !phrase.collections.some((name) => foldName(name) === wanted)) {
        return false;
      }
      if (!needle) return true;
      return [phrase.phrase, phrase.literalMeaning, phrase.usageExample, phrase.ref].some(
        (field) => foldName(field).includes(needle),
      );
    });
  }, [sorted, deferredQuery, collection]);

  // The same four pieces the word page uses; see `useListPage`.
  const {
    selection,
    editing,
    setEditingId,
    pendingDelete,
    setPendingDelete,
    pendingNames,
  } = useListPage(visible, idOfPhrase, nameOfPhrase);

  return (
    <>
      <ListShell
        title="Idioms, Proverbs and other Phrases"
        marker="section-green"
        wide
        subtitle={
          !loaded
            ? "Loading your phrases…"
            : phrases.length === 0
              ? "Expressions worth remembering"
              : plural(phrases.length, "phrase", "phrases")
        }
      >
        {!loaded ? (
          <div className="card h-64 animate-pulse" aria-hidden="true" />
        ) : phrases.length === 0 ? (
          <EmptyState
            doodle="heart"
            tilt="0.8deg"
            icon="💬"
            title="No phrases yet"
            action={<><span aria-hidden="true">+</span> Add your first phrase</>}
            onAction={() => setIsAdding(true)}
          >
            Phrases are the multi-word expressions that do not fit a single word: idioms,
            set phrases, turns of speech. Save the wording now and fill in what it means and how it
            is used whenever you like.
          </EmptyState>
        ) : (
          <>
            <div
              className={`${STICKY_FILTERS} flex flex-wrap items-center gap-2`}
            >
              <div className="w-full sm:w-1/3 lg:min-w-64">
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
              <CollectionFilter
                id="phrase-collection"
                collections={collections}
                value={collection}
                onChange={setCollection}
              />

              <button
                type="button"
                className="btn btn-primary shrink-0 sm:ml-auto"
                onClick={() => setIsAdding(true)}
              >
                <span aria-hidden="true">+</span> Add phrase
              </button>
            </div>

            {visible.length === 0 ? (
              <NoMatches
                noun="phrase"
                hint="Try different wording, or another collection."
                onClear={() => {
                  setQuery("");
                  setCollection("");
                }}
              />
            ) : (
              <>
                <p className="sr-only" aria-live="polite">
                  {visible.length} of {phrases.length} phrases shown
                </p>
                <SelectionBar selection={selection} noun="phrase" onDelete={setPendingDelete} />
                {/* See `useWideScreen`: one layout once known, both until. */}
                {wide !== false && (
                <PhraseTable
                  phrases={visible}
                  onSelectCollection={setCollection}
                  sort={sort}
                  onToggleSort={(key) =>
                    setSort((current) =>
                      current === null || current.key !== key
                        ? { key, direction: "asc" }
                        : current.direction === "asc"
                          ? { key, direction: "desc" }
                          : null,
                    )
                  }
                  linkIndex={linkIndex}
                  selection={selection}
                  onEdit={setEditingId}
                  onDelete={(id) => setPendingDelete([id])}
                />
                )}
                {wide !== true && (
                  <PhraseCards
                    phrases={visible}
                    linkIndex={linkIndex}
                    selection={selection}
                    onEdit={setEditingId}
                    onDelete={(id) => setPendingDelete([id])}
                  />
                )}
                {query.trim() !== "" && (
                  <p className="mt-3 text-xs text-ink-soft">
                    Showing {visible.length} of {phrases.length} phrases.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </ListShell>

      {isAdding && <AddPhraseDialog onClose={() => setIsAdding(false)} />}

      {editing && (
        <EditPhraseDialog phrase={editing} onClose={() => setEditingId(null)} />
      )}

      {pendingDelete && pendingNames.length > 0 && (
        <ConfirmDeleteDialog
          names={pendingNames}
          noun="phrase"
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
  onSelectCollection,
  sort,
  onToggleSort,
  linkIndex,
  selection,
  onEdit,
  onDelete,
}: {
  phrases: Phrase[];
  onSelectCollection: (name: string) => void;
  sort: PhraseSort;
  onToggleSort: (key: PhraseSortKey) => void;
  linkIndex: LinkIndex;
  selection: ListSelection;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    // Written on the paper, like Vocabulary: no card or borders, one ruled
    // line per row, so each cell is cut to one line; the phrase's own page
    // shows it in full. `data-ruled-snap` lets `RuledLines` move the table's
    // top onto a line.
    <div data-ruled-snap className="hidden md:block">
      <table className="w-full table-fixed border-collapse text-left font-hand text-[1.05rem]">
        <thead className="text-ink">
          <tr>
            <th scope="col" className={`w-10 ${ROW_CONTROL}`}>
              <SelectAllCheckbox selection={selection} noun="phrase" />
            </th>
            {COLUMNS.map(({ key, label, className }) => {
              const direction = key && sort?.key === key ? sort.direction : null;
              return (
                <SortHeader
                  key={label}
                  label={label}
                  className={className}
                  direction={direction}
                  onSort={key ? () => onToggleSort(key) : undefined}
                  title={
                    direction === null
                      ? "Sort A to Z"
                      : direction === "asc"
                        ? "Sort Z to A"
                        : "Back to newest first"
                  }
                />
              );
            })}
            <th scope="col" className={`w-32 ${ROW_CONTROL}`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {phrases.map((phrase) => {
            const selected = selection.isSelected(phrase.id);
            return (
              <tr
                key={phrase.id}
                // Washes, not fills, so the ruling still shows through.
                className={`transition-colors hover:bg-marker/20 ${
                  selected ? "bg-tile-green/60" : ""
                }`}
              >
                <td className={ROW_CONTROL}>
                  <SelectRowCheckbox
                    checked={selected}
                    onChange={() => selection.toggle(phrase.id)}
                    label={phrase.phrase}
                  />
                </td>
                <td className={`${ROW_TEXT} truncate`} title={phrase.phrase}>
                  {/* The name opens the phrase, it does not edit it, which is
                      what the Vocabulary list does and for the same reason:
                      stopping at a row while reading is not a decision to
                      change anything. Editing has the pencil at the end of the
                      row and the Edit button on the page itself. */}
                  <Link
                    href={`/phrase?id=${phrase.id}`}
                    className="font-medium text-link hover:underline"
                  >
                    {phrase.phrase}
                  </Link>
                </td>
                <td className={`${ROW_TEXT} truncate text-ink`} title={phrase.literalMeaning || undefined}>
                  {phrase.literalMeaning ? (
                    phrase.literalMeaning
                  ) : (
                    <EmptyCell />
                  )}
                </td>
                <td className={`${ROW_TEXT} truncate text-ink`} title={phrase.usageExample || undefined}>
                  {phrase.usageExample ? (
                    <span className="italic">{phrase.usageExample}</span>
                  ) : (
                    <EmptyCell />
                  )}
                </td>
                <td className={ROW_TEXT}>
                  {phrase.collections.length > 0 ? (
                    <div className="flex gap-1 overflow-hidden">
                      {phrase.collections.map((name) => (
                        <CollectionBadge key={name} name={name} onSelect={onSelectCollection} />
                      ))}
                    </div>
                  ) : (
                    <EmptyCell />
                  )}
                </td>
                <td className={`${ROW_TEXT} truncate text-ink-soft`}>
                  {phrase.ref ? (
                    <span>
                      <RefText value={phrase.ref} linkIndex={linkIndex} />
                    </span>
                  ) : (
                    <EmptyCell />
                  )}
                </td>
                <td className={ROW_CONTROL}>
                  <div className="flex items-center justify-end gap-0.5">
                    <SpeakButton speechKey={`phrase:${phrase.id}`} label={phrase.phrase} parts={() => studiedParts(phrase.phrase)} />
                    <RowEditButton label={phrase.phrase} onClick={() => onEdit(phrase.id)} />
                    <RowDeleteButton
                      label={phrase.phrase}
                      onClick={() => onDelete(phrase.id)}
                    />
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
    // Written on the paper too, as on Vocabulary: every line of an entry is
    // one line of the ruling (32px). Each text size repeats `leading-8`,
    // because Tailwind's size classes bring their own line height.
    <div data-ruled-snap className="leading-8 md:hidden">
      <label className="flex h-8 w-fit cursor-pointer items-center gap-2 text-sm text-ink-soft select-none">
        <SelectAllCheckbox selection={selection} noun="phrase" />
        Select all
      </label>

      <ul>
        {phrases.map((phrase) => {
          const selected = selection.isSelected(phrase.id);
          return (
            <li key={phrase.id} className={selected ? "bg-tile-green/60" : ""}>
              <div className="flex h-8 items-center gap-2.5">
                <SelectRowCheckbox
                  checked={selected}
                  onChange={() => selection.toggle(phrase.id)}
                  label={phrase.phrase}
                />
                <h2 className="min-w-0 flex-1 truncate font-semibold">
                  <Link href={`/phrase?id=${phrase.id}`} className="text-link hover:underline">
                    {phrase.phrase}
                  </Link>
                </h2>
                <div className="-mr-1 flex shrink-0 items-center gap-0.5">
                  <SpeakButton speechKey={`phrase:${phrase.id}`} label={phrase.phrase} parts={() => studiedParts(phrase.phrase)} />
                  <RowEditButton label={phrase.phrase} onClick={() => onEdit(phrase.id)} />
                  <RowDeleteButton label={phrase.phrase} onClick={() => onDelete(phrase.id)} />
                </div>
              </div>
              {phrase.collections.length > 0 && (
                <div className="flex h-8 items-center gap-1 overflow-hidden">
                  {phrase.collections.map((name) => (
                    <CollectionBadge key={name} name={name} />
                  ))}
                </div>
              )}
              {phrase.literalMeaning && (
                <p className="line-clamp-2 text-sm leading-8 text-ink">{phrase.literalMeaning}</p>
              )}
              {phrase.usageExample && (
                <p className="line-clamp-2 text-sm leading-8 text-ink-soft italic">“{phrase.usageExample}”</p>
              )}
              {phrase.ref && (
                <p className="truncate text-xs leading-8 text-ink-soft">
                  <span className="font-medium">Ref: </span>
                  <RefText value={phrase.ref} linkIndex={linkIndex} />
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
