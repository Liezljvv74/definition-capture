"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { CategoryBadge, SourceBadge } from "@/components/Badges";
import { EditPhraseDialog } from "@/components/EditPhraseDialog";
import { buildLinkIndex, RefText, type LinkIndex } from "@/components/RefText";
import type { Phrase } from "@/lib/types";
import { useWords } from "@/lib/useWords";
import { usePhrases } from "@/lib/usePhrases";

/**
 * Where a `[[Phrase]]` reference lands, addressed as `/phrase?id=abc123`.
 *
 * Query parameter rather than path segment for the same reason as `/word`,
 * which explains it: a constraint of the static-export era that the saved
 * links now outlive. The singular path also keeps this clear of `/phrases`,
 * which is the list.
 *
 * Thinner than the word page, because a phrase carries no dates: what is here
 * is the untruncated text, the Source, and a Ref whose references can be
 * followed. The list clamps the first of those to three lines and leaves the
 * Source out of the table altogether.
 */
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
  const id = useSearchParams().get("id") ?? "";
  const { phrases, loaded } = usePhrases();
  const { entries } = useWords();
  const phrase = phrases.find((candidate) => candidate.id === id);

  const linkIndex = useMemo(() => buildLinkIndex(entries, phrases), [entries, phrases]);

  return (
    <>
      <header className="bg-card-green">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link
            href="/phrases"
            className="text-sm font-medium text-indigo-900 hover:underline"
          >
            ← Back to phrases
          </Link>
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

        <Field label="Literal meaning" empty="No literal meaning yet. Use Edit to fill it in.">
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

        <Field label="Source" empty="None">
          <SourceBadge source={phrase.source} />
        </Field>

        <Field label="Category" empty="None">
          {phrase.categories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {phrase.categories.map((name) => (
                <CategoryBadge key={name} name={name} />
              ))}
            </div>
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
        There is no phrase with that ID in your list. It may have been deleted, or the link
        may point to a phrase in a different account, since your list follows the account you are
        signed in to.
      </p>
      <Link href="/phrases" className="btn btn-primary mt-5">
        Back to phrases
      </Link>
    </div>
  );
}
