"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AddTermDialog } from "@/components/AddTermDialog";
import { BackupButtons } from "@/components/BackupButtons";
import { NeedsDefinitionBadge, SourceBadge } from "@/components/Badges";
import { buildLinkIndex, RefText, type LinkIndex } from "@/components/RefText";
import { sourceOrder } from "@/lib/constants";
import type { Entry } from "@/lib/types";
import { useGlossary } from "@/lib/useGlossary";
import { usePhrases } from "@/lib/usePhrases";

type SortKey = "term" | "source" | "dateAdded";
type SortDirection = "asc" | "desc";
type Sort = { key: SortKey; direction: SortDirection };

const COLUMNS: { key: SortKey | null; label: string; className?: string }[] = [
  { key: "term", label: "Term", className: "w-[22%]" },
  { key: null, label: "Definition" },
  { key: "source", label: "Source", className: "w-[12%]" },
  { key: null, label: "Ref", className: "w-[20%]" },
];

function compare(a: Entry, b: Entry, key: SortKey): number {
  switch (key) {
    case "term":
      return a.term.localeCompare(b.term, undefined, { sensitivity: "base" });
    case "source":
      return sourceOrder(a.source) - sourceOrder(b.source);
    case "dateAdded":
      return a.dateAdded.localeCompare(b.dateAdded);
  }
}

export default function GlossaryPage() {
  const { entries, loaded } = useGlossary();
  const { phrases } = usePhrases();
  const [isAdding, setIsAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [onlyNeedsDefinition, setOnlyNeedsDefinition] = useState(false);
  // Date added is no longer a column, but it is still the default order and
  // the tie-breaker, so the newest terms stay at the top.
  const [sort, setSort] = useState<Sort>({ key: "dateAdded", direction: "desc" });

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const filtered = entries.filter((entry) => {
      if (onlyNeedsDefinition && !entry.needsDefinition) return false;
      if (!needle) return true;
      return (
        entry.term.toLocaleLowerCase().includes(needle) ||
        entry.definition.toLocaleLowerCase().includes(needle) ||
        entry.ref.toLocaleLowerCase().includes(needle)
      );
    });

    return [...filtered].sort((a, b) => {
      const result = compare(a, b, sort.key);
      if (result !== 0) return sort.direction === "asc" ? result : -result;
      // Ties fall back to newest-first so the order is always stable.
      return b.dateAdded.localeCompare(a.dateAdded);
    });
  }, [entries, query, onlyNeedsDefinition, sort]);

  const linkIndex = useMemo(() => buildLinkIndex(entries, phrases), [entries, phrases]);
  const missingCount = entries.filter((entry) => entry.needsDefinition).length;
  const isFiltered = query.trim() !== "" || onlyNeedsDefinition;

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "dateAdded" ? "desc" : "asc" },
    );
  }

  return (
    <>
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Definition Capture
            </h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {!loaded
                ? "Loading your glossary…"
                : entries.length === 0
                  ? "Your personal glossary"
                  : `${entries.length} ${entries.length === 1 ? "term" : "terms"}${
                      missingCount > 0 ? ` · ${missingCount} still need a definition` : ""
                    }`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BackupButtons />
            <button type="button" className="btn btn-primary" onClick={() => setIsAdding(true)}>
              <span aria-hidden="true">+</span> Add term
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {!loaded ? (
          <div className="card h-64 animate-pulse" aria-hidden="true" />
        ) : entries.length === 0 ? (
          <EmptyGlossary onAdd={() => setIsAdding(true)} />
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex-1">
                <label htmlFor="search" className="sr-only">
                  Search terms and definitions
                </label>
                <input
                  id="search"
                  type="search"
                  className="field"
                  placeholder="Search terms and definitions…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>

              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-slate-600 select-none dark:text-slate-300">
                <input
                  type="checkbox"
                  className="size-4 accent-indigo-600"
                  checked={onlyNeedsDefinition}
                  onChange={(event) => setOnlyNeedsDefinition(event.target.checked)}
                />
                Needs definition
              </label>
            </div>

            {visible.length === 0 ? (
              <NoMatches
                onClear={() => {
                  setQuery("");
                  setOnlyNeedsDefinition(false);
                }}
              />
            ) : (
              <>
                <p className="sr-only" aria-live="polite">
                  {visible.length} of {entries.length} terms shown
                </p>
                <EntryTable
                  entries={visible}
                  sort={sort}
                  onSort={toggleSort}
                  linkIndex={linkIndex}
                />
                <EntryCards entries={visible} linkIndex={linkIndex} />
                {isFiltered && (
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Showing {visible.length} of {entries.length} terms.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </main>

      {isAdding && <AddTermDialog onClose={() => setIsAdding(false)} />}
    </>
  );
}

/* ------------------------------------------------------------------ table  */

function EntryTable({
  entries,
  sort,
  onSort,
  linkIndex,
}: {
  entries: Entry[];
  sort: Sort;
  onSort: (key: SortKey) => void;
  linkIndex: LinkIndex;
}) {
  return (
    <div className="card hidden overflow-hidden md:block">
      <table className="w-full table-fixed border-collapse text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
          <tr>
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
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
          {entries.map((entry) => (
            <tr
              key={entry.id}
              className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                entry.needsDefinition ? "bg-amber-50/70 dark:bg-amber-400/5" : ""
              }`}
            >
              <td className="px-4 py-3 align-top">
                <Link
                  href={`/terms/${entry.id}?edit=1`}
                  className="font-medium text-indigo-700 hover:underline dark:text-indigo-300"
                >
                  {entry.term}
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
                <SourceBadge source={entry.source} />
              </td>
              <td className="px-4 py-3 align-top text-slate-600 dark:text-slate-400">
                {entry.ref ? (
                  <span className="line-clamp-2 break-words">
                    <RefText value={entry.ref} linkIndex={linkIndex} />
                  </span>
                ) : (
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                    —
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ cards  */

function EntryCards({ entries, linkIndex }: { entries: Entry[]; linkIndex: LinkIndex }) {
  return (
    <ul className="space-y-3 md:hidden">
      {entries.map((entry) => (
        <li key={entry.id}>
          {/* A plain card, not a link — the Ref field may contain its own links,
              and an anchor cannot be nested inside another anchor. */}
          <div
            className={`card p-4 transition hover:border-indigo-300 dark:hover:border-indigo-500/50 ${
              entry.needsDefinition ? "border-l-4 border-l-amber-400" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-semibold">
                <Link
                  href={`/terms/${entry.id}?edit=1`}
                  className="text-indigo-700 hover:underline dark:text-indigo-300"
                >
                  {entry.term}
                </Link>
              </h2>
              {entry.needsDefinition && <NeedsDefinitionBadge />}
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
              <SourceBadge source={entry.source} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------- empty states */

function EmptyGlossary({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="card mx-auto max-w-xl p-8 text-center">
      <div aria-hidden="true" className="mb-3 text-4xl">
        📖
      </div>
      <h2 className="text-lg font-semibold">Your glossary is empty</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
        Definition Capture is a place to park the words and concepts you meet while studying, so
        you can search and review them later. Save a term now and write the definition whenever
        you like — blank ones get flagged so they are easy to find again.
      </p>
      <button type="button" className="btn btn-primary mt-5" onClick={onAdd}>
        <span aria-hidden="true">+</span> Add your first term
      </button>
    </div>
  );
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="card p-8 text-center">
      <h2 className="font-semibold">No terms match those filters</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        Try a different search, or clear the filters below.
      </p>
      <button type="button" className="btn btn-secondary mt-4" onClick={onClear}>
        Clear filters
      </button>
    </div>
  );
}
