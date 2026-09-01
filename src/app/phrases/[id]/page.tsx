"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { BackupButtons } from "@/components/BackupButtons";
import { PhraseForm } from "@/components/PhraseForm";
import { buildLinkIndex, RefText, type LinkIndex } from "@/components/RefText";
import { deletePhrase, updatePhrase } from "@/lib/phraseStorage";
import type { Phrase, PhraseInput } from "@/lib/types";
import { useGlossary } from "@/lib/useGlossary";
import { usePhrases } from "@/lib/usePhrases";

export default function PhraseDetailPage() {
  // `useSearchParams` needs a boundary to suspend against during prerender.
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <PhraseDetail />
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

function PhraseDetail() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { phrases, loaded } = usePhrases();
  const { entries } = useGlossary();
  const phrase = phrases.find((candidate) => candidate.id === id);

  const linkIndex = useMemo(() => buildLinkIndex(entries, phrases), [entries, phrases]);

  // Selecting a phrase in the list links here with ?edit=1, so the form is
  // already open; the bare URL still opens the phrase read-only.
  const startInEditMode = useSearchParams().get("edit") === "1";

  return (
    <>
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link
            href="/phrases"
            className="text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-300"
          >
            ← Back to phrases
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <BackupButtons />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
        {!loaded ? (
          <div className="card h-56 animate-pulse" aria-hidden="true" />
        ) : phrase ? (
          <PhraseDetailCard
            phrase={phrase}
            linkIndex={linkIndex}
            startInEditMode={startInEditMode}
          />
        ) : (
          <PhraseNotFound />
        )}
      </main>
    </>
  );
}

function PhraseDetailCard({
  phrase,
  linkIndex,
  startInEditMode,
}: {
  phrase: Phrase;
  linkIndex: LinkIndex;
  startInEditMode: boolean;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(startInEditMode);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  /** Leaves the form and drops ?edit=1, so a reload shows the saved phrase. */
  function stopEditing() {
    setIsEditing(false);
    router.replace(`/phrases/${phrase.id}`, { scroll: false });
  }

  function handleSave(input: PhraseInput) {
    updatePhrase(phrase.id, input);
    stopEditing();
  }

  if (isEditing) {
    return (
      <div className="card p-5 sm:p-6">
        <h1 className="mb-4 text-lg font-semibold">Edit phrase</h1>
        <PhraseForm
          initialValue={{
            phrase: phrase.phrase,
            literalMeaning: phrase.literalMeaning,
            usageExample: phrase.usageExample,
            ref: phrase.ref,
          }}
          submitLabel="Save changes"
          onSubmit={handleSave}
          onCancel={stopEditing}
          autoFocus
        />
      </div>
    );
  }

  return (
    <article className="card p-5 sm:p-7">
      <h1 className="text-2xl font-semibold tracking-tight">{phrase.phrase}</h1>

      <Field label="Literal meaning" empty="No literal meaning yet — use Edit to fill it in.">
        {phrase.literalMeaning && (
          <p className="whitespace-pre-wrap text-slate-800 dark:text-slate-200">
            {phrase.literalMeaning}
          </p>
        )}
      </Field>

      <Field label="Usage example" empty="No example yet.">
        {phrase.usageExample && (
          <p className="whitespace-pre-wrap text-slate-800 italic dark:text-slate-200">
            “{phrase.usageExample}”
          </p>
        )}
      </Field>

      <Field label="Ref" empty="None">
        {phrase.ref && (
          <p className="break-words text-slate-800 dark:text-slate-200">
            <RefText value={phrase.ref} linkIndex={linkIndex} />
          </p>
        )}
      </Field>

      <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
        {isConfirmingDelete ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              Delete “{phrase.phrase}” permanently?
            </p>
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
              This removes the phrase from your list and cannot be undone.
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
                  deletePhrase(phrase.id);
                  router.push("/phrases");
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

function Field({
  label,
  empty,
  children,
}: {
  label: string;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {label}
      </h2>
      <div className="mt-1.5">
        {children || <p className="text-slate-500 italic dark:text-slate-400">{empty}</p>}
      </div>
    </div>
  );
}

function PhraseNotFound() {
  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <div aria-hidden="true" className="mb-3 text-4xl">
        🔍
      </div>
      <h1 className="text-lg font-semibold">Phrase not found</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        There is no phrase with that ID in your list. It may have been deleted, or the link may
        be from a different browser — everything is saved on this device only.
      </p>
      <Link href="/phrases" className="btn btn-primary mt-5">
        Back to phrases
      </Link>
    </div>
  );
}
