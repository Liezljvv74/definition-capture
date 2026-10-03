"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type CSSProperties } from "react";

import { CollectionBadge, SourceBadge } from "@/components/Badges";
import { EditPhraseDialog } from "@/components/EditPhraseDialog";
import { LinkedFrom } from "@/components/LinkedFrom";
import { SpeakButton } from "@/components/SpeakButton";
import { RefText } from "@/components/RefText";
import { formatDate, formatDateTime } from "@/lib/format";
import type { LinkIndex } from "@/lib/links";
import type { Phrase } from "@/lib/types";
import { useLinkTargets } from "@/lib/useLinkTargets";
import { usePhrases } from "@/lib/usePhrases";
import { studiedParts } from "@/lib/speech";

/**
 * Where a `[[Phrase]]` reference lands, addressed as `/phrase?id=abc123`.
 *
 * Query parameter rather than path segment for the same reason as `/word`,
 * which explains it: a constraint of the static-export era that the saved
 * links now outlive. The singular path also keeps this clear of `/phrases`,
 * which is the list.
 *
 * Thinner than the word page, because a phrase is never edited into a second
 * date: what is here is the untruncated text, the Source, the date it was
 * captured, and a Ref whose references can be followed. The list clamps the
 * text to three lines and leaves the other two out of the table altogether.
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
    <main className="notebook-page mx-auto w-full max-w-5xl flex-1 py-6">
      <div className="card h-56 animate-pulse" aria-hidden="true" />
    </main>
  );
}

function PhraseDetail() {
  const id = useSearchParams().get("id") ?? "";
  const { phrases, loaded } = usePhrases();
  const phrase = phrases.find((candidate) => candidate.id === id);

  const { linkIndex } = useLinkTargets();

  return (
    <>
      <header className="notebook-page mx-auto w-full max-w-5xl pt-6">
        <Link href="/phrases" className="text-sm font-medium text-link hover:underline">
          ← Back to phrases
        </Link>
      </header>

      <main className="notebook-page mx-auto w-full max-w-5xl flex-1 py-6">
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
      {/* Laid out to fit one screen, as the word page is: the meaning and
          example on the left, the four short facts as two pairs on the
          right, and Edit beside the title. */}
      <article className="tape rounded-[6px_14px_8px_12px] border-[3px] border-ink bg-card p-5 shadow-[4px_5px_0_var(--color-shadow)] sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <h1 className="hand-title text-2xl sm:text-3xl [overflow-wrap:anywhere]">
            <span className="marker section-green">{phrase.phrase}</span>
          </h1>
          <SpeakButton speechKey={`phrase-page:${phrase.id}`} label={phrase.phrase} parts={() => studiedParts(phrase.phrase)} className="mt-1" />
          {/* Editing is offered here so a cross-link that lands on a typo can
              fix it on the spot. Deleting is not: the list owns that. */}
          <button type="button" className="btn btn-primary ml-auto" onClick={() => setIsEditing(true)}>
            Edit
          </button>
        </div>

        <div className="mt-4 grid gap-x-8 gap-y-5 md:grid-cols-2">
          <div className="space-y-4">
            <Field label="Literal meaning" empty="No literal meaning yet. Use Edit to fill it in.">
              {phrase.literalMeaning && <p className="whitespace-pre-wrap text-ink">{phrase.literalMeaning}</p>}
            </Field>

            <Field label="Usage example" empty="No example yet.">
              {phrase.usageExample && (
                <p className="flex items-start gap-1 whitespace-pre-wrap text-ink italic">
                  <SpeakButton
                    speechKey={`example:${phrase.id}`}
                    label="the usage example"
                    parts={() => studiedParts(phrase.usageExample)}
                    className="-ml-1.5 not-italic"
                  />
                  <span>“{phrase.usageExample}”</span>
                </p>
              )}
            </Field>
          </div>

          <div className="grid grid-cols-2 content-start gap-x-6 gap-y-4">
            <Field label="Source" empty="None">
              <SourceBadge source={phrase.source} />
            </Field>

            <Field label="Collection" empty="None">
              {phrase.collections.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {phrase.collections.map((name) => (
                    <CollectionBadge key={name} name={name} />
                  ))}
                </div>
              )}
            </Field>

            <Field label="Ref" empty="None">
              {phrase.ref && (
                <p className="text-sm break-words text-ink">
                  <RefText value={phrase.ref} linkIndex={linkIndex} />
                </p>
              )}
            </Field>

            {/* The day, with the time on hover, the way the word page shows it. A
                phrase restored from a backup keeps the date it was captured, so
                this is not simply when the row reached this database. */}
            <Field label="Date added" empty="Unknown">
              {phrase.dateAdded && (
                <p className="text-sm text-ink">
                  <span title={formatDateTime(phrase.dateAdded)}>{formatDate(phrase.dateAdded)}</span>
                </p>
              )}
            </Field>
          </div>
        </div>

        <LinkedFrom href={`/phrase?id=${phrase.id}`} />
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
    <div>
      <h2 className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
        {label}
      </h2>
      <div className="mt-1">
        {children || <p className="text-ink-soft italic">{empty}</p>}
      </div>
    </div>
  );
}

function PhraseNotFound() {
  return (
    <div
      className="paste tape tape-centre mx-auto max-w-lg rounded-[10px_3px_12px_4px] border-2 border-ink bg-card p-8 text-center shadow-[3px_4px_0_var(--color-shadow)]"
      style={{ "--r": "-0.8deg" } as CSSProperties}
    >
      <div aria-hidden="true" className="mb-3 text-4xl">
        🔍
      </div>
      <h1 className="hand-title text-xl">Phrase not found</h1>
      <p className="mt-2 text-sm text-ink-soft">
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
