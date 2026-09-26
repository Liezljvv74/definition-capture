"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";

import { TopicBadge } from "@/components/Badges";
import { BlockView } from "@/components/grammar/BlockView";
import { RuleEditor } from "@/components/grammar/RuleEditor";
import { buildLinkIndex, type LinkIndex } from "@/components/RefText";
import { formatDate, formatDateTime } from "@/lib/format";
import { updateRule } from "@/lib/rules";
import type { Rule } from "@/lib/types";
import { usePhrases } from "@/lib/usePhrases";
import { useRules } from "@/lib/useRules";
import { useSettings } from "@/lib/useSettings";
import { useWords } from "@/lib/useWords";

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
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
      <div className="card h-56 animate-pulse" aria-hidden="true" />
    </main>
  );
}

function RuleDetail() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const { rules, loaded } = useRules();
  const { entries } = useWords();
  const { phrases } = usePhrases();
  const rule = rules.find((candidate) => candidate.id === id);
  // Rules and verb tables become link targets in stage 2; until then a
  // `[[Name]]` in a rule reaches what a Ref reaches: words and phrases.
  const linkIndex = useMemo(() => buildLinkIndex(entries, phrases), [entries, phrases]);

  return (
    <>
      <header className="bg-card-rose">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/grammar" className="text-sm font-medium text-slate-900 hover:underline">
            ← Back to Grammar
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
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
        <h1 className="text-2xl font-semibold tracking-tight">{rule.title}</h1>
        <TopicBadge name={rule.topic} />
      </div>

      {rule.blocks.length === 0 ? (
        <p className="mt-4 text-slate-500 italic dark:text-slate-400">Nothing written yet. Use Edit to start.</p>
      ) : (
        <div className="mt-5 space-y-5">
          {rule.blocks.map((block) => (
            <BlockView key={block.id} block={block} linkIndex={linkIndex} />
          ))}
        </div>
      )}

      <dl className="mt-6 grid gap-4 border-t border-slate-200 pt-5 sm:grid-cols-2 dark:border-slate-800">
        <div>
          <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Date added</dt>
          <dd className="mt-1.5 text-sm text-slate-700 dark:text-slate-300">
            <span title={formatDateTime(rule.dateAdded)}>{formatDate(rule.dateAdded)}</span>
            {rule.dateUpdated && (
              <span className="block text-xs text-slate-500 dark:text-slate-400" title={formatDateTime(rule.dateUpdated)}>
                Edited {formatDate(rule.dateUpdated)}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {/* Deleting is not offered here; the Grammar list owns that, as the word list does. */}
      <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
        <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>
          Edit
        </button>
      </div>
    </article>
  );
}

function NotFound() {
  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <h1 className="text-lg font-semibold">Rule not found</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        There is no rule with that ID in your account. It may have been deleted, or the link may
        belong to a different account.
      </p>
      <Link href="/grammar" className="btn btn-primary mt-5">
        Back to Grammar
      </Link>
    </div>
  );
}
