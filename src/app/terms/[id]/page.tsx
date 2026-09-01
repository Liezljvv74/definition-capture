"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { BackupButtons } from "@/components/BackupButtons";
import { ModuleBadge, NeedsDefinitionBadge, SourceBadge } from "@/components/Badges";
import { EntryForm } from "@/components/EntryForm";
import { formatDateTime } from "@/lib/format";
import { deleteEntry, updateEntry } from "@/lib/storage";
import type { Entry, EntryInput } from "@/lib/types";
import { useGlossary } from "@/lib/useGlossary";

export default function TermDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { entries, loaded } = useGlossary();
  const entry = entries.find((candidate) => candidate.id === id);

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
          <EntryDetail entry={entry} />
        ) : (
          <TermNotFound />
        )}
      </main>
    </>
  );
}

function EntryDetail({ entry }: { entry: Entry }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  function handleSave(input: EntryInput) {
    updateEntry(entry.id, input);
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <div className="card p-5 sm:p-6">
        <h1 className="mb-4 text-lg font-semibold">Edit term</h1>
        <EntryForm
          initialValue={{
            term: entry.term,
            definition: entry.definition,
            moduleTag: entry.moduleTag,
            source: entry.source,
          }}
          submitLabel="Save changes"
          onSubmit={handleSave}
          onCancel={() => setIsEditing(false)}
          autoFocus
        />
      </div>
    );
  }

  return (
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
            Module / Tag
          </dt>
          <dd className="mt-1.5">
            <ModuleBadge tag={entry.moduleTag} />
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            Source
          </dt>
          <dd className="mt-1.5">
            <SourceBadge source={entry.source} />
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            Date added
          </dt>
          <dd className="mt-1.5 text-sm text-slate-700 dark:text-slate-300">
            {formatDateTime(entry.dateAdded)}
            {entry.dateUpdated && (
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                Edited {formatDateTime(entry.dateUpdated)}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
        {isConfirmingDelete ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              Delete “{entry.term}” permanently?
            </p>
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
              This removes the entry from your glossary and cannot be undone.
            </p>
            <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsConfirmingDelete(false)}
              >
                Keep it
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  deleteEntry(entry.id);
                  router.push("/");
                }}
              >
                Yes, delete
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => setIsEditing(true)}>
              Edit
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsConfirmingDelete(true)}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </article>
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
