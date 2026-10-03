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
import { linkWarning } from "@/lib/links";
import { deleteRules } from "@/lib/rules";
import { useLinkTargets } from "@/lib/useLinkTargets";
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
  const { targets, linkIndex } = useLinkTargets();
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
      <header className="notebook-page mx-auto w-full max-w-6xl pt-6 sm:pt-8">
        <h1 className="hand-title text-2xl sm:text-3xl">
          <span className="marker section-sage">Grammar</span>
        </h1>
        <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
      </header>

      <main className="notebook-page mx-auto w-full max-w-6xl flex-1 py-6">
        {loaded && rules.length === 0 ? (
          <div className="card mx-auto max-w-xl p-8 text-center">
            <h2 className="hand-title text-xl">No rules yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
              A rule has a title and a topic, and is written as text, tables and examples on its own page.
            </p>
            <button type="button" className="btn btn-primary mt-5" onClick={() => setAdding(true)}>
              + Add rule
            </button>
          </div>
        ) : (
          <>
            <div className={`${STICKY_FILTERS} flex flex-wrap items-center gap-2`}>
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
              <p className="mb-2 text-xs text-ink-soft">
                Showing {visible.length} of {rules.length} rules.
              </p>
            )}

            {/* Written on the paper like the word lists: no cards, one ruled
                line per rule, so the title and its topic stay on one line and
                a long title is cut off rather than wrapping. */}
            <ul data-ruled-snap>
              {visible.map((rule) => (
                <li key={rule.id} className="flex h-8 items-center gap-2 text-sm sm:gap-3 sm:text-base">
                  <Link href={`/rule?id=${rule.id}`} className="min-w-0 truncate font-medium text-link hover:underline" title={rule.title}>
                    {rule.title}
                  </Link>
                  <TopicBadge name={rule.topic} onSelect={setTopic} />
                  <span className="hidden text-xs whitespace-nowrap text-ink-soft sm:inline">
                    {rule.blocks.length === 0 ? "Nothing written yet" : `${rule.blocks.length} ${rule.blocks.length === 1 ? "block" : "blocks"}`}
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-0.5">
                    <RowEditButton label={rule.title} onClick={() => router.push(`/rule?id=${rule.id}&edit=1`)} />
                    <RowDeleteButton label={rule.title} onClick={() => setPendingDelete([rule.id])} />
                  </span>
                </li>
              ))}
            </ul>

            {loaded && visible.length === 0 && (
              <p className="py-6 text-sm text-ink-soft">
                No rule matches.{" "}
                <button type="button" className="link-button" onClick={() => { setQuery(""); setTopic(""); }}>
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
          warning={linkWarning(targets, linkIndex, targets.filter((t) => t.kind === "rule" && pendingDelete.includes(t.id)))}
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
