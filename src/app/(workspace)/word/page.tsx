"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { CategoryBadge, NeedsDefinitionBadge, SourceBadge } from "@/components/Badges";
import { EditWordDialog } from "@/components/EditWordDialog";
import { buildLinkIndex, RefText, type LinkIndex } from "@/components/RefText";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Entry } from "@/lib/types";
import { useWords } from "@/lib/useWords";
import { usePhrases } from "@/lib/usePhrases";

/**
 * Where a `[[Name]]` reference lands, addressed as `/word?id=abc123`.
 *
 * The id is a query parameter rather than a path segment. That began as a
 * static-export constraint — there was no server, and `/vocabulary/[id]` had no
 * ids to pre-render — which no longer applies now that there is one. The URL
 * shape is kept because links to it have been pasted into notes outside the
 * app, where nothing can follow a rename; moving
 * to `/vocabulary/[id]` would mean a redirect for those, and is worth doing only
 * as a deliberate change rather than as a side effect.
 *
 * This page reads; it does not manage. Adding, editing, and deleting all happen
 * on the word list.
 */
export default function WordPage() {
  // `useSearchParams` needs a boundary to suspend against during prerender.
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <WordDetail />
    </Suspense>
  );
}

function DetailSkeleton() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
      <div className="card h-56 animate-pulse" aria-hidden="true" />
    </main>
  );
}

function WordDetail() {
  const id = useSearchParams().get("id") ?? "";
  const { entries, loaded } = useWords();
  const { phrases } = usePhrases();
  const entry = entries.find((candidate) => candidate.id === id);

  const linkIndex = useMemo(() => buildLinkIndex(entries, phrases), [entries, phrases]);

  return (
    <>
      <header className="border-b border-slate-300 bg-slate-200 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link
            href="/vocabulary"
            className="text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-300"
          >
            ← Back to Vocabulary
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
        {!loaded ? (
          <div className="card h-56 animate-pulse" aria-hidden="true" />
        ) : entry ? (
          <EntryDetail entry={entry} linkIndex={linkIndex} />
        ) : (
          <WordNotFound />
        )}
      </main>
    </>
  );
}

function EntryDetail({ entry, linkIndex }: { entry: Entry; linkIndex: LinkIndex }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);

  return (
    <>
      <article className="card p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{entry.word}</h1>
          {entry.needsDefinition && <NeedsDefinitionBadge />}
        </div>

        <div className="mt-4">
          <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            Definition
          </h2>
          {entry.definition ? (
            <p className="mt-1.5 whitespace-pre-wrap text-slate-800 dark:text-slate-200">
              {entry.definition}
            </p>
          ) : (
            <p className="mt-1.5 text-slate-500 italic dark:text-slate-400">
              No definition yet. Use Edit to fill it in.
            </p>
          )}
        </div>

        <dl className="mt-6 grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2 lg:grid-cols-4 dark:border-slate-800">
          <div>
            <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Source
            </dt>
            {/* Shown, not edited — Source is a field on the edit form like any other. */}
            <dd className="mt-1.5">
              <SourceBadge source={entry.source} />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Category
            </dt>
            <dd className="mt-1.5 flex flex-wrap gap-1">
              {entry.categories.length > 0 ? (
                entry.categories.map((name) => <CategoryBadge key={name} name={name} />)
              ) : (
                <span className="text-sm text-slate-400 italic dark:text-slate-500">None</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Ref
            </dt>
            <dd className="mt-1.5 text-sm break-words text-slate-700 dark:text-slate-300">
              {entry.ref ? (
                <RefText value={entry.ref} linkIndex={linkIndex} />
              ) : (
                <span className="text-slate-400 italic dark:text-slate-500">None</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
              Date added
            </dt>
            <dd className="mt-1.5 text-sm text-slate-700 dark:text-slate-300">
              <span title={formatDateTime(entry.dateAdded)}>{formatDate(entry.dateAdded)}</span>
              {entry.dateUpdated && (
                <span
                  className="block text-xs text-slate-500 dark:text-slate-400"
                  title={formatDateTime(entry.dateUpdated)}
                >
                  Edited {formatDate(entry.dateUpdated)}
                </span>
              )}
            </dd>
          </div>
        </dl>

        {/* Editing is offered here so a cross-link that lands on a typo can fix
            it on the spot. Deleting is not — the word list owns that. */}
        <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
          <button type="button" className="btn btn-primary" onClick={() => setIsEditing(true)}>
            Edit
          </button>
        </div>
      </article>

      {isEditing && (
        <EditWordDialog
          entry={entry}
          onClose={() => setIsEditing(false)}
          onSaved={() => router.push("/vocabulary")}
        />
      )}
    </>
  );
}

function WordNotFound() {
  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <div aria-hidden="true" className="mb-3 text-4xl">
        🔍
      </div>
      <h1 className="text-lg font-semibold">Word not found</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        There is no entry with that ID in your word list. It may have been deleted, or the
        link may point to a word in a different account, since your list follows the account you
        are signed in to.
      </p>
      <Link href="/vocabulary" className="btn btn-primary mt-5">
        Back to Vocabulary
      </Link>
    </div>
  );
}
