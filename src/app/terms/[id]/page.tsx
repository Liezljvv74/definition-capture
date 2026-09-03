"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { BackupButtons } from "@/components/BackupButtons";
import { NeedsDefinitionBadge, SourceBadge } from "@/components/Badges";
import { EditTermDialog } from "@/components/EditTermDialog";
import { buildLinkIndex, RefText, type LinkIndex } from "@/components/RefText";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Entry } from "@/lib/types";
import { useGlossary } from "@/lib/useGlossary";
import { usePhrases } from "@/lib/usePhrases";

/**
 * Where a `[[Term]]` reference lands.
 *
 * This page reads; it does not manage. Adding, editing, and deleting all happen
 * on the glossary list, so there is no second screen for changing one field —
 * Source included, which is edited in the same form as everything else.
 */
export default function TermDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { entries, loaded } = useGlossary();
  const { phrases } = usePhrases();
  const entry = entries.find((candidate) => candidate.id === id);

  const linkIndex = useMemo(() => buildLinkIndex(entries, phrases), [entries, phrases]);

  return (
    <>
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-300"
          >
            ← Back to glossary
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <BackupButtons />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
        {!loaded ? (
          <div className="card h-56 animate-pulse" aria-hidden="true" />
        ) : entry ? (
          <EntryDetail entry={entry} linkIndex={linkIndex} />
        ) : (
          <TermNotFound />
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
          <h1 className="text-2xl font-semibold tracking-tight">{entry.term}</h1>
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
              No definition yet — use Edit to fill it in.
            </p>
          )}
        </div>

        <dl className="mt-6 grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-3 dark:border-slate-800">
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
            it on the spot. Deleting is not — the glossary list owns that. */}
        <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
          <button type="button" className="btn btn-primary" onClick={() => setIsEditing(true)}>
            Edit
          </button>
        </div>
      </article>

      {isEditing && (
        <EditTermDialog
          entry={entry}
          onClose={() => setIsEditing(false)}
          onSaved={() => router.push("/")}
        />
      )}
    </>
  );
}

function TermNotFound() {
  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <div aria-hidden="true" className="mb-3 text-4xl">
        🔍
      </div>
      <h1 className="text-lg font-semibold">Term not found</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        There is no entry with that ID in your glossary. It may have been deleted, or the link
        may be from a different browser — entries are saved on this device only.
      </p>
      <Link href="/" className="btn btn-primary mt-5">
        Back to glossary
      </Link>
    </div>
  );
}
