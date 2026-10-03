"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { TopicBadge } from "@/components/Badges";
import { LinkedFrom } from "@/components/LinkedFrom";
import { BlockView } from "@/components/grammar/BlockView";
import { ReadingTools } from "@/components/grammar/ReadingTools";
import { RuleEditor } from "@/components/grammar/RuleEditor";
import { RuleReader } from "@/components/grammar/RuleReader";
import { formatDate, formatDateTime } from "@/lib/format";
import type { LinkIndex } from "@/lib/links";
import { updateRule } from "@/lib/rules";
import type { Rule } from "@/lib/types";
import { useLinkTargets } from "@/lib/useLinkTargets";
import { useRules } from "@/lib/useRules";
import { useSettings } from "@/lib/useSettings";

/**
 * One rule, addressed as `/rule?id=abc`, the shape every item page has. It
 * opens in a reading view, because a rule is read far more often than it is
 * written, and Edit turns the same page into the editor. `&edit=1` opens it
 * editing straight away, which is how a rule just made arrives.
 */
export default function RulePage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <RuleDetail />
    </Suspense>
  );
}

function Skeleton() {
  return (
    <main className="notebook-page mx-auto w-full max-w-6xl flex-1 py-6">
      <div className="card h-56 animate-pulse" aria-hidden="true" />
    </main>
  );
}

function RuleDetail() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const { rules, loaded } = useRules();
  const rule = rules.find((candidate) => candidate.id === id);
  const { linkIndex } = useLinkTargets();

  return (
    <>
      <header className="notebook-page mx-auto w-full max-w-6xl pt-6 sm:pt-8">
        <Link href="/grammar" className="text-sm font-medium text-link hover:underline">
          ← Back to Grammar
        </Link>
      </header>
      <main className="notebook-page mx-auto w-full max-w-6xl flex-1 py-6">
        {!loaded ? (
          <div className="card h-56 animate-pulse" aria-hidden="true" />
        ) : rule ? (
          <RuleBody key={rule.id} rule={rule} linkIndex={linkIndex} startEditing={params.get("edit") === "1"} />
        ) : (
          <NotFound />
        )}
      </main>
    </>
  );
}

function RuleBody({ rule, linkIndex, startEditing }: { rule: Rule; linkIndex: LinkIndex; startEditing: boolean }) {
  const router = useRouter();
  const { settings } = useSettings();
  const [editing, setEditing] = useState(startEditing);

  if (editing) {
    return (
      <article className="card p-5 sm:p-7">
        <RuleEditor
          rule={rule}
          topics={settings.topics}
          onSave={(input) => {
            updateRule(rule.id, input);
            setEditing(false);
            // Drop `&edit=1` so a reload shows the rule rather than the editor.
            router.replace(`/rule?id=${rule.id}`);
          }}
          onCancel={() => {
            setEditing(false);
            router.replace(`/rule?id=${rule.id}`);
          }}
        />
      </article>
    );
  }

  return (
    <article className="card p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="hand-title text-2xl sm:text-3xl" data-speak-lang="native">
          <span className="marker section-sage">{rule.title}</span>
        </h1>
        <TopicBadge name={rule.topic} />
      </div>

      {rule.blocks.length === 0 ? (
        <p className="mt-4 text-ink-soft italic">Nothing written yet. Use Edit to start.</p>
      ) : (
        <ReadingTools rule={rule}>
          <div className="mt-5 space-y-5 font-sans leading-relaxed">
            {/* Each block says which language it is read in, and is the
                element RuleReader outlines while reading it. */}
            {rule.blocks.map((block) => (
              <div
                key={block.id}
                data-speak-block={block.id}
                data-speak-lang={block.kind === "text" ? "native" : "studied"}
              >
                <BlockView block={block} linkIndex={linkIndex} />
              </div>
            ))}
          </div>
        </ReadingTools>
      )}

      <dl className="mt-6 grid gap-4 border-t border-rule pt-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold tracking-wide text-ink-soft uppercase">Date added</dt>
          <dd className="mt-1.5 text-sm text-ink">
            <span title={formatDateTime(rule.dateAdded)}>{formatDate(rule.dateAdded)}</span>
            {rule.dateUpdated && (
              <span className="block text-xs text-ink-soft" title={formatDateTime(rule.dateUpdated)}>
                Edited {formatDate(rule.dateUpdated)}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <LinkedFrom href={`/rule?id=${rule.id}`} />

      {/* Deleting is not offered here; the Grammar list owns that, as the word list does. */}
      <div className="mt-6 border-t border-rule pt-5">
        <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>

      <RuleReader rule={rule} />
    </article>
  );
}

function NotFound() {
  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <h1 className="hand-title text-xl">Rule not found</h1>
      <p className="mt-2 text-sm text-ink-soft">
        There is no rule with that ID in your account. It may have been deleted, or the link may
        belong to a different account.
      </p>
      <Link href="/grammar" className="btn btn-primary mt-5">
        Back to Grammar
      </Link>
    </div>
  );
}
