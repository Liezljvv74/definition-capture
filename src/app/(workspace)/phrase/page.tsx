"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { CollectionBadge, SourceBadge } from "@/components/Badges";
import { DateAdded, DETAIL_LABEL, DetailFrame, DetailSuspense, NotFoundCard } from "@/components/DetailShell";
import { EditPhraseDialog } from "@/components/EditPhraseDialog";
import { LinkedFrom } from "@/components/LinkedFrom";
import { SpeakButton } from "@/components/SpeakButton";
import { RefText } from "@/components/RefText";
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
  return (
    <DetailSuspense>
      <PhraseDetail />
    </DetailSuspense>
  );
}

function PhraseDetail() {
  const id = useSearchParams().get("id") ?? "";
  const { phrases, loaded } = usePhrases();
  const phrase = phrases.find((candidate) => candidate.id === id);

  const { linkIndex } = useLinkTargets();

  return (
    <DetailFrame backHref="/phrases" backLabel="phrases" loaded={loaded} notFound={<PhraseNotFound />}>
      {phrase && <PhraseDetailCard phrase={phrase} linkIndex={linkIndex} />}
    </DetailFrame>
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
                  <DateAdded added={phrase.dateAdded} />
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
      <h2 className={DETAIL_LABEL}>{label}</h2>
      <div className="mt-1">
        {children || <p className="text-ink-soft italic">{empty}</p>}
      </div>
    </div>
  );
}

function PhraseNotFound() {
  return (
    <NotFoundCard title="Phrase not found" href="/phrases" label="phrases" tilt="-0.8deg">
      There is no phrase with that ID in your list. It may have been deleted, or the link
      may point to a phrase in a different account, since your list follows the account you are
      signed in to.
    </NotFoundCard>
  );
}
