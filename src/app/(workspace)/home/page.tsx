import type { Metadata } from "next";
import Link from "next/link";

import { RememberCard } from "@/components/home/RememberCard";
import { ReviewCard } from "@/components/home/ReviewCard";
import { itemHref, progressParts, relativeDay, reviewState, typeLabel } from "@/lib/home";
import { loadHome } from "@/lib/homeData";

export const metadata: Metadata = { title: "Home" };

/**
 * The signed-in dashboard: what to review, how far along you are, and what
 * you were last working on, in the layout of the owner's mockup.
 *
 * A server component that renders complete, with no loading state: the data
 * is read before the HTML is sent. Only the review buttons and Show meaning
 * are client components. On a phone the cards stack in the order a learner
 * needs them, review first; `lg:order-none` hands the desktop back to the
 * source order, which is the mockup's two rows.
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
        `${summary.words} ${summary.words === 1 ? "word" : "words"}` +
        (summary.wordsWithoutDefinition > 0
          ? ` · ${summary.wordsWithoutDefinition} ${summary.wordsWithoutDefinition === 1 ? "needs" : "need"} a definition`
          : ""),
    },
    { href: "/phrases", label: "Phrases", colour: "bg-card-green", detail: `${summary.phrases} ${summary.phrases === 1 ? "phrase" : "phrases"}` },
    { href: "/verbs", label: "Verbs", colour: "bg-card-purple", detail: `${summary.verbTables} conjugation ${summary.verbTables === 1 ? "table" : "tables"}` },
    { href: "/grammar", label: "Grammar", colour: "bg-card-sage", detail: `${summary.grammarRules} ${summary.grammarRules === 1 ? "rule" : "rules"}` },
  ];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="order-1 self-end lg:order-none lg:col-span-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Welcome back, {name}</h1>
          {summary.lastSavedAt && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Last saved {relativeDay(summary.lastSavedAt, now)}. Here is where you left off.
            </p>
          )}
        </div>

        {totalCards > 0 && (
          <section aria-labelledby="progress-heading" className="card order-3 p-5 lg:order-none">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="progress-heading" className="font-semibold">Your progress</h2>
              <p className="text-xs text-slate-600 dark:text-slate-400">{totalCards} items</p>
            </div>
            <div
              role="img"
              aria-label={parts.map((p) => `${p.count} ${p.label.toLowerCase()}`).join(", ")}
              className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full"
            >
              {parts
                .filter((p) => p.count > 0)
                .map((p) => (
                  <div key={p.label} className={p.className} style={{ width: `${p.percent}%` }} />
                ))}
            </div>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {parts.map((p) => (
                <li key={p.label} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className={`size-2 rounded-sm ${p.className}`} />
                  {p.label} {p.count}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              An item counts as learned once you have typed its meaning correctly on your last reviews.
            </p>
          </section>
        )}

        <ReviewCard state={reviewState(summary, now)} className="order-2 lg:order-none lg:col-span-2" />

        {remember && <RememberCard item={remember} className="order-4 lg:order-none" />}

        {recent.length > 0 && (
          <section aria-labelledby="recent-heading" className="card order-5 p-5 lg:order-none lg:col-span-3">
            <h2 id="recent-heading" className="font-semibold">Recently captured</h2>
            <ul className="mt-3 grid gap-x-8 sm:grid-cols-2">
              {recent.map((item) => (
                <li key={item.id} className="border-t border-slate-200 py-2 dark:border-slate-800">
                  <Link href={itemHref(item)} className="font-semibold hover:underline">
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

        <nav aria-label="Your lists" className="order-6 grid gap-4 sm:grid-cols-2 lg:order-none lg:col-span-3 lg:grid-cols-4">
          {lists.map((list) => (
            <Link key={list.href} href={list.href} className="card flex items-center gap-3 p-4 transition hover:brightness-95">
              <span aria-hidden="true" className={`size-9 shrink-0 rounded-lg ${list.colour}`} />
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
