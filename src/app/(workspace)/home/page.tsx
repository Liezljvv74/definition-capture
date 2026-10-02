import type { Metadata } from "next";
import Link from "next/link";

import { RememberCard } from "@/components/home/RememberCard";
import { ReviewCard } from "@/components/home/ReviewCard";
import { itemHref, plural, progressParts, relativeDay, reviewState, typeLabel } from "@/lib/home";
import { loadHome } from "@/lib/homeData";

export const metadata: Metadata = { title: "Home" };

/**
 * The signed-in dashboard: what to review, how far along you are, and what
 * you were last working on, in the layout of the owner's mockup.
 *
 * A server component that renders complete, with no loading state: the data
 * is read before the HTML is sent. Only the review buttons and the remembered
 * word are client components. Source order is the phone order, and on desktop
 * the same sequence is laid out in three columns, so no `order-*` is needed.
 *
 * The sizes are chosen so the dashboard fits one laptop screen without scrolling.
 */
export default async function HomePage() {
  const { name, summary, recent, remember } = await loadHome();
  const now = new Date();
  const parts = progressParts(summary);
  const totalCards = summary.newItems + summary.learning + summary.learned;

  const lists = [
    {
      href: "/vocabulary",
      label: "Vocabulary",
      colour: "bg-card-blue",
      detail:
        plural(summary.words, "word", "words") +
        (summary.wordsWithoutDefinition > 0
          ? ` · ${plural(summary.wordsWithoutDefinition, "needs", "need")} a definition`
          : ""),
    },
    { href: "/phrases", label: "Phrases", colour: "bg-card-green", detail: plural(summary.phrases, "phrase", "phrases") },
    { href: "/verbs", label: "Verbs", colour: "bg-card-purple", detail: plural(summary.verbTables, "conjugation table", "conjugation tables") },
    { href: "/grammar", label: "Grammar", colour: "bg-card-sage", detail: plural(summary.grammarRules, "rule", "rules") },
  ];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-4 sm:px-6 sm:py-5">
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-3">
          <h1 className="text-xl [overflow-wrap:anywhere] font-semibold tracking-tight sm:text-2xl">Welcome back, {name}</h1>
          {summary.lastSavedAt && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Last saved {relativeDay(summary.lastSavedAt, now)}. Here is where you left off.
            </p>
          )}
        </div>

        {totalCards > 0 && (
          <section aria-labelledby="progress-heading" className="card p-4 lg:col-span-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="progress-heading" className="text-sm font-semibold">Your progress</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">{totalCards} items</p>
            </div>
            <div
              role="img"
              aria-label={parts.map((p) => `${p.count} ${p.label.toLowerCase()}`).join(", ")}
              className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full"
            >
              {parts
                .filter((p) => p.count > 0)
                .map((p) => (
                  <div key={p.label} className={p.className} style={{ width: `${p.percent}%` }} />
                ))}
            </div>
            <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
              {parts.map((p) => (
                <li key={p.label} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className={`size-2 rounded-sm ${p.className}`} />
                  {p.label} {p.count}
                </li>
              ))}
            </ul>
          </section>
        )}

        <ReviewCard state={reviewState(summary, now)} className="lg:col-span-2" />

        {remember && <RememberCard item={remember} />}

        {recent.length > 0 && (
          <section aria-labelledby="recent-heading" className="card p-4 lg:col-span-3">
            <h2 id="recent-heading" className="text-sm font-semibold">Recently captured</h2>
            <ul className="mt-2 grid gap-x-8 sm:grid-cols-2">
              {recent.map((item) => (
                <li key={item.id} className="border-t border-slate-200 py-1.5 dark:border-slate-800">
                  <Link href={itemHref(item)} className="font-semibold [overflow-wrap:anywhere] hover:underline">
                    {item.title}
                  </Link>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {[typeLabel(item.itemType), item.collection, relativeDay(item.createdAt, now)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <nav aria-label="Your lists" className="grid gap-3 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-4">
          {lists.map((list) => (
            <Link key={list.href} href={list.href} className="card flex items-center gap-3 p-3 transition hover:brightness-95">
              <span aria-hidden="true" className={`size-7 shrink-0 rounded-lg ${list.colour}`} />
              <span>
                <span className="block font-semibold">{list.label}</span>
                <span className="block text-xs text-slate-600 dark:text-slate-400">{list.detail}</span>
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
