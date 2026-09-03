"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { BackupButtons } from "@/components/BackupButtons";
import { EditPhraseDialog } from "@/components/EditPhraseDialog";
import { buildLinkIndex, RefText, type LinkIndex } from "@/components/RefText";
import type { Phrase } from "@/lib/types";
import { useGlossary } from "@/lib/useGlossary";
import { usePhrases } from "@/lib/usePhrases";

/**
 * Where a `[[Phrase]]` reference lands.
 *
 * This page is deliberately thin. Phrases carry no dates and no source, so it
 * has nothing to show that the list does not already show — its one real job is
 * to be a destination for cross-links, spelling out text the list has to clamp.
 * Adding, editing, and deleting all happen on the list itself.
 */
export default function PhraseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const { phrases, loaded } = usePhrases();
  const { entries } = useGlossary();
  const phrase = phrases.find((candidate) => candidate.id === id);

  const linkIndex = useMemo(() => buildLinkIndex(entries, phrases), [entries, phrases]);

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
          <PhraseDetailCard phrase={phrase} linkIndex={linkIndex} />
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
}: {
  phrase: Phrase;
  linkIndex: LinkIndex;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);

  return (
    <>
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

        {/* Editing is offered here so a cross-link that lands on a typo can fix
            it on the spot. Deleting is not — the list owns that. */}
        <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
          <button type="button" className="btn btn-primary" onClick={() => setIsEditing(true)}>
            Edit
          </button>
        </div>
      </article>

      {isEditing && (
        <EditPhraseDialog
          phrase={phrase}
          onClose={() => setIsEditing(false)}
          onSaved={() => router.push("/phrases")}
        />
      )}
    </>
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
