"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { TopicBadge } from "@/components/Badges";
import { ConfirmDeleteDialog, RowDeleteButton } from "@/components/DeleteControls";
import { AddRuleDialog } from "@/components/grammar/AddRuleDialog";
import { RowEditButton } from "@/components/RowEditButton";
import { STICKY_FILTERS } from "@/components/StickyFilters";
import { foldName } from "@/lib/foldName";
import { deleteRules } from "@/lib/rules";
import { useListPage } from "@/lib/useListPage";
import { useRules } from "@/lib/useRules";
import { useSettings } from "@/lib/useSettings";
import { useSorting } from "@/lib/useSorting";

/**
 * Every rule, one row each, with the same search, filter and per-row
 * controls as the other lists. The List | Map toggle arrives in stage 4 of
 * the design; until then this is the list alone.
 */
export default function GrammarPage() {
  const router = useRouter();
  const { rules, loaded } = useRules();
  const { settings } = useSettings();
  const sorting = useSorting();
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("");
  const [adding, setAdding] = useState(false);

  const visible = useMemo(() => {
    const needle = foldName(query);
    return rules
      .filter((rule) => !topic || foldName(rule.topic) === foldName(topic))
      .filter((rule) => !needle || foldName(rule.title).includes(needle))
      .sort((a, b) => sorting.compareText(a.title, b.title));
  }, [rules, query, topic, sorting]);

  const { pendingDelete, setPendingDelete, pendingNames } = useListPage(
    visible,
    (rule) => rule.id,
    (rule) => rule.title,
  );

  // The filter offers every topic in use as well as the Settings list, so a
  // rule filed under a topic since taken off the list is still reachable.
  const topics = useMemo(() => {
    const names = new Map<string, string>();
    for (const name of [...settings.topics, ...rules.map((rule) => rule.topic)]) {
      if (name && !names.has(foldName(name))) names.set(foldName(name), name);
    }
    return [...names.values()].sort(sorting.compareText);
  }, [settings.topics, rules, sorting]);

  const subtitle = !loaded
    ? "Loading your rules…"
    : `${rules.length} ${rules.length === 1 ? "rule" : "rules"}`;

  return (
    <>
      <header className="bg-card-rose">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Grammar</h1>
            <p className="mt-0.5 text-sm text-slate-700">{subtitle}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {loaded && rules.length === 0 ? (
          <div className="card mx-auto max-w-xl p-8 text-center">
            <h2 className="text-lg font-semibold">No rules yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
              A rule has a title and a topic, and is written as text, tables and examples on its own page.
            </p>
            <button type="button" className="btn btn-primary mt-5" onClick={() => setAdding(true)}>
              + Add rule
            </button>
          </div>
        ) : (
          <>
            <div className={`${STICKY_FILTERS} mb-3 flex flex-wrap items-center gap-2`}>
              <div className="w-full sm:w-1/2 lg:w-64">
                <label htmlFor="rule-search" className="sr-only">Search rules</label>
                <input id="rule-search" type="search" className="field" placeholder="Search rules…" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
              {topics.length > 0 && (
                <div className="w-full sm:w-44">
                  <label htmlFor="rule-topic" className="sr-only">Filter by topic</label>
                  <select id="rule-topic" className="field" value={topic} onChange={(event) => setTopic(event.target.value)}>
                    <option value="">All topics</option>
                    {topics.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              )}
              <button type="button" className="btn btn-primary shrink-0 sm:ml-auto" onClick={() => setAdding(true)}>
                <span aria-hidden="true">+</span> Add rule
              </button>
            </div>

            {visible.length !== rules.length && (
              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                Showing {visible.length} of {rules.length} rules.
              </p>
            )}

            <ul className="space-y-1.5">
              {visible.map((rule) => (
                <li key={rule.id} className="card flex flex-wrap items-center gap-3 px-4 py-3">
                  <Link href={`/rule?id=${rule.id}`} className="font-medium text-indigo-700 hover:underline dark:text-indigo-300">
                    {rule.title}
                  </Link>
                  <TopicBadge name={rule.topic} onSelect={setTopic} />
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {rule.blocks.length === 0 ? "Nothing written yet" : `${rule.blocks.length} ${rule.blocks.length === 1 ? "block" : "blocks"}`}
                  </span>
                  <span className="ml-auto flex items-center gap-1">
                    <RowEditButton label={rule.title} onClick={() => router.push(`/rule?id=${rule.id}&edit=1`)} />
                    <RowDeleteButton label={rule.title} onClick={() => setPendingDelete([rule.id])} />
                  </span>
                </li>
              ))}
            </ul>

            {loaded && visible.length === 0 && (
              <p className="py-6 text-sm text-slate-600 dark:text-slate-300">
                No rule matches.{" "}
                <button type="button" className="cursor-pointer text-indigo-700 underline underline-offset-2 dark:text-indigo-300" onClick={() => { setQuery(""); setTopic(""); }}>
                  Clear the search
                </button>
              </p>
            )}
          </>
        )}
      </main>

      {adding && <AddRuleDialog topics={settings.topics} onClose={() => setAdding(false)} />}

      {pendingDelete && (
        <ConfirmDeleteDialog
          names={pendingNames}
          noun="rule"
          nounPlural="rules"
          onConfirm={() => {
            deleteRules(pendingDelete);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
