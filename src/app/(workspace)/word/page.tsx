"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type CSSProperties } from "react";

import { CollectionBadge, NeedsDefinitionBadge, SourceBadge } from "@/components/Badges";
import { EditWordDialog } from "@/components/EditWordDialog";
import { LinkedFrom } from "@/components/LinkedFrom";
import { RefText } from "@/components/RefText";
import { formatDate, formatDateTime } from "@/lib/format";
import type { LinkIndex } from "@/lib/links";
import type { Entry } from "@/lib/types";
import { useLinkTargets } from "@/lib/useLinkTargets";
import { useWords } from "@/lib/useWords";

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
    <main className="notebook-page mx-auto w-full max-w-3xl flex-1 py-6">
      <div className="card h-56 animate-pulse" aria-hidden="true" />
    </main>
  );
}

function WordDetail() {
  const id = useSearchParams().get("id") ?? "";
  const { entries, loaded } = useWords();
  const entry = entries.find((candidate) => candidate.id === id);

  const { linkIndex } = useLinkTargets();

  return (
    <>
      <header className="notebook-page mx-auto w-full max-w-3xl pt-6">
        <Link href="/vocabulary" className="text-sm font-medium text-link hover:underline">
          ← Back to Vocabulary
        </Link>
      </header>

      <main className="notebook-page mx-auto w-full max-w-3xl flex-1 py-6">
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
      <article
        className="paste tape rounded-[6px_14px_8px_12px] border-[3px] border-ink bg-card p-5 shadow-[4px_5px_0_var(--color-shadow)] sm:p-7"
        style={{ "--r": "-0.4deg" } as CSSProperties}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="hand-title text-2xl sm:text-3xl [overflow-wrap:anywhere]">
            <span className="marker section-blue">{entry.word}</span>
          </h1>
          {entry.needsDefinition && <NeedsDefinitionBadge />}
        </div>

        <div className="mt-4">
          <h2 className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
            Definition
          </h2>
          {entry.definition ? (
            <p className="mt-1.5 whitespace-pre-wrap text-ink">
              {entry.definition}
            </p>
          ) : (
            <p className="mt-1.5 text-ink-soft italic">
              No definition yet. Use Edit to fill it in.
            </p>
          )}
        </div>

        <dl className="mt-6 grid gap-4 border-t border-rule pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
              Source
            </dt>
            {/* Shown, not edited — Source is a field on the edit form like any other. */}
            <dd className="mt-1.5">
              <SourceBadge source={entry.source} />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
              Collection
            </dt>
            <dd className="mt-1.5 flex flex-wrap gap-1">
              {entry.collections.length > 0 ? (
                entry.collections.map((name) => <CollectionBadge key={name} name={name} />)
              ) : (
                <span className="text-sm text-ink-soft italic">None</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
              Ref
            </dt>
            <dd className="mt-1.5 text-sm break-words text-ink">
              {entry.ref ? (
                <RefText value={entry.ref} linkIndex={linkIndex} />
              ) : (
                <span className="text-ink-soft italic">None</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
              Date added
            </dt>
            <dd className="mt-1.5 text-sm text-ink">
              <span title={formatDateTime(entry.dateAdded)}>{formatDate(entry.dateAdded)}</span>
              {entry.dateUpdated && (
                <span
                  className="block text-xs text-ink-soft"
                  title={formatDateTime(entry.dateUpdated)}
                >
                  Edited {formatDate(entry.dateUpdated)}
                </span>
              )}
            </dd>
          </div>
        </dl>

        <LinkedFrom href={`/word?id=${entry.id}`} />

        {/* Editing is offered here so a cross-link that lands on a typo can fix
            it on the spot. Deleting is not — the word list owns that. */}
        <div className="mt-6 border-t border-rule pt-5">
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
    <div
      className="paste tape tape-centre mx-auto max-w-lg rounded-[10px_3px_12px_4px] border-2 border-ink bg-card p-8 text-center shadow-[3px_4px_0_var(--color-shadow)]"
      style={{ "--r": "0.8deg" } as CSSProperties}
    >
      <div aria-hidden="true" className="mb-3 text-4xl">
        🔍
      </div>
      <h1 className="hand-title text-xl">Word not found</h1>
      <p className="mt-2 text-sm text-ink-soft">
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
