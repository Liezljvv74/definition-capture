"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { CollectionBadge, NeedsDefinitionBadge, SourceBadge } from "@/components/Badges";
import { DateAdded, DETAIL_LABEL as LABEL, DetailFrame, DetailSuspense, NotFoundCard } from "@/components/DetailShell";
import { EditWordDialog } from "@/components/EditWordDialog";
import { LinkedFrom } from "@/components/LinkedFrom";
import { SpeakButton } from "@/components/SpeakButton";
import { RefText } from "@/components/RefText";
import type { LinkIndex } from "@/lib/links";
import type { Entry } from "@/lib/types";
import { useLinkTargets } from "@/lib/useLinkTargets";
import { useWords } from "@/lib/useWords";
import { studiedParts } from "@/lib/speech";

/**
 * Where a `[[Name]]` reference lands, addressed as `/word?id=abc123`.
 *
 * The id is a query parameter rather than a path segment. That began as a
 * static-export constraint; there was no server, and `/vocabulary/[id]` had no
 * ids to pre-render, which no longer applies now that there is one. The URL
 * shape is kept because links to it have been pasted into notes outside the
 * app, where nothing can follow a rename; moving
 * to `/vocabulary/[id]` would mean a redirect for those, and is worth doing only
 * as a deliberate change rather than as a side effect.
 *
 * This page reads; it does not manage. Adding, editing, and deleting all happen
 * on the word list.
 */
export default function WordPage() {
  return (
    <DetailSuspense>
      <WordDetail />
    </DetailSuspense>
  );
}

function WordDetail() {
  const id = useSearchParams().get("id") ?? "";
  const { entries, loaded } = useWords();
  const entry = entries.find((candidate) => candidate.id === id);

  const { linkIndex } = useLinkTargets();

  return (
    <DetailFrame backHref="/vocabulary" backLabel="Vocabulary" loaded={loaded} notFound={<WordNotFound />}>
      {entry && <EntryDetail entry={entry} linkIndex={linkIndex} />}
    </DetailFrame>
  );
}

function EntryDetail({ entry, linkIndex }: { entry: Entry; linkIndex: LinkIndex }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);

  return (
    <>
      {/* Laid out to fit one screen: the definition on the left, the four
          short facts as two pairs on the right, and Edit beside the title
          rather than in a row of its own. Not tilted, since it holds the
          page's main action. */}
      <article className="tape rounded-[6px_14px_8px_12px] border-[3px] border-ink bg-card p-5 shadow-[4px_5px_0_var(--color-shadow)] sm:p-6">
        <div className="flex flex-wrap items-start gap-3">
          <h1 className="hand-title text-2xl sm:text-3xl [overflow-wrap:anywhere]">
            <span className="marker section-blue">{entry.word}</span>
          </h1>
          <SpeakButton speechKey={`word-page:${entry.id}`} label={entry.word} parts={() => studiedParts(entry.word)} className="mt-1" />
          {entry.needsDefinition && <NeedsDefinitionBadge />}
          {/* Editing is offered here so a cross-link that lands on a typo can
              fix it on the spot. Deleting is not: the word list owns that. */}
          <button type="button" className="btn btn-primary ml-auto" onClick={() => setIsEditing(true)}>
            Edit
          </button>
        </div>

        <div className="mt-4 grid gap-x-8 gap-y-5 md:grid-cols-2">
          <div>
            <h2 className={LABEL}>Definition</h2>
            {entry.definition ? (
              <p className="mt-1 whitespace-pre-wrap text-ink">{entry.definition}</p>
            ) : (
              <p className="mt-1 text-ink-soft italic">No definition yet. Use Edit to fill it in.</p>
            )}
          </div>

          <dl className="grid grid-cols-2 content-start gap-x-6 gap-y-4">
            <div>
              <dt className={LABEL}>Source</dt>
              {/* Shown, not edited: Source is a field on the edit form like any other. */}
              <dd className="mt-1">
                <SourceBadge source={entry.source} />
              </dd>
            </div>
            <div>
              <dt className={LABEL}>Collection</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {entry.collections.length > 0 ? (
                  entry.collections.map((name) => <CollectionBadge key={name} name={name} />)
                ) : (
                  <span className="text-sm text-ink-soft italic">None</span>
                )}
              </dd>
            </div>
            <div>
              <dt className={LABEL}>Ref</dt>
              <dd className="mt-1 text-sm break-words text-ink">
                {entry.ref ? (
                  <RefText value={entry.ref} linkIndex={linkIndex} />
                ) : (
                  <span className="text-ink-soft italic">None</span>
                )}
              </dd>
            </div>
            <div>
              <dt className={LABEL}>Date added</dt>
              <dd className="mt-1 text-sm text-ink">
                <DateAdded added={entry.dateAdded} updated={entry.dateUpdated} />
              </dd>
            </div>
          </dl>
        </div>

        <LinkedFrom href={`/word?id=${entry.id}`} />
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
    <NotFoundCard title="Word not found" href="/vocabulary" label="Vocabulary" tilt="0.8deg">
      There is no entry with that ID in your word list. It may have been deleted, or the
      link may point to a word in a different account, since your list follows the account you
      are signed in to.
    </NotFoundCard>
  );
}
