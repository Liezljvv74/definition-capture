import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";

import { Scribble } from "@/components/notebook/Scribble";

import { RememberCard } from "@/components/home/RememberCard";
import { ReviewCard } from "@/components/home/ReviewCard";
import { itemHref, plural, progressParts, quoteFor, relativeDay, reviewState, typeLabel } from "@/lib/home";
import { loadHome } from "@/lib/homeData";

/** A paste block's tilt, which notebook.css reads from `--r`. */
const tilt = (deg: number) => ({ "--r": `${deg}deg` }) as CSSProperties;

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
      look: "bg-tile-blue border-[3px] rounded-[4px_12px_3px_10px] shadow-[4px_5px_0_var(--color-shadow)] tape tape-right",
      deg: -1.2,
      doodle: "star",
      detail:
        plural(summary.words, "word", "words") +
        (summary.wordsWithoutDefinition > 0
          ? ` · ${plural(summary.wordsWithoutDefinition, "needs", "need")} a definition`
          : ""),
    },
    { href: "/phrases", label: "Phrases", look: "bg-tile-green border-[1.5px] rounded-[10px_3px_12px_4px] shadow-[2px_3px_0_var(--color-shadow)]", deg: 1, doodle: "heart", detail: plural(summary.phrases, "phrase", "phrases") },
    { href: "/verbs", label: "Verbs", look: "bg-tile-purple border-2 rounded-[3px_10px_4px_12px] shadow-[3px_4px_0_var(--color-shadow)] tape tape-centre", deg: 0.9, doodle: "spiral", detail: plural(summary.verbTables, "conjugation table", "conjugation tables") },
    { href: "/grammar", label: "Grammar", look: "bg-tile-sage border-[3.5px] rounded-[12px_4px_10px_3px] shadow-[5px_5px_0_var(--color-shadow)]", deg: -0.8, doodle: "sparkle", detail: plural(summary.grammarRules, "rule", "rules") },
  ];

  return (
    <main className="notebook-page mx-auto w-full max-w-5xl flex-1 py-6 sm:py-8">
      <div className="grid gap-x-5 gap-y-7 lg:grid-cols-3">
        <div className="lg:col-span-3">
          <h1 className="hand-title text-2xl [overflow-wrap:anywhere] sm:text-3xl">
            Welcome back, <Scribble>{name}</Scribble>
          </h1>
          {summary.lastSavedAt && (
            <p className="mt-2 text-sm text-ink-soft">
              Last saved {relativeDay(summary.lastSavedAt, now)}. Here is where you left off.
            </p>
          )}
        </div>

        {totalCards > 0 && (
          <section aria-labelledby="progress-heading" className="paste tape tape-two rounded-[6px_14px_8px_12px] border-[3px] border-ink bg-card p-4 shadow-[4px_5px_0_var(--color-shadow)] lg:col-span-3"
            style={tilt(-0.5)}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="progress-heading" className="hand-title text-lg">Your progress</h2>
              <p className="text-sm text-ink-soft">{totalCards} items</p>
            </div>
            <div
              role="img"
              aria-label={parts.map((p) => `${p.count} ${p.label.toLowerCase()}`).join(", ")}
              className="mt-2 flex h-3 gap-0.5 overflow-hidden rounded-full border-[1.5px] border-ink"
            >
              {parts
                .filter((p) => p.count > 0)
                .map((p) => (
                  <div key={p.label} className={p.className} style={{ width: `${p.percent}%` }} />
                ))}
            </div>
            <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
              {parts.map((p) => (
                <li key={p.label} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className={`size-2.5 rounded-sm border border-ink ${p.className}`} />
                  {p.label} {p.count}
                </li>
              ))}
            </ul>
          </section>
        )}

        <ReviewCard state={reviewState(summary, now)} quote={quoteFor(now)} className="lg:col-span-2" />

        {remember && <RememberCard item={remember} />}

        {recent.length > 0 && (
          <section aria-labelledby="recent-heading" className="paste tape tape-pink rounded-[4px] border-[1.5px] border-dashed border-ink-soft bg-card p-4 shadow-[2px_3px_8px_rgb(0_0_0/0.18)] lg:col-span-3"
            style={tilt(0.6)}
          >
            <h2 id="recent-heading" className="hand-title text-lg">Recently captured</h2>
            <ul className="mt-2 grid gap-x-8 sm:grid-cols-2">
              {recent.map((item) => (
                <li key={item.id} className="border-t-[1.5px] border-dashed border-rule py-1.5">
                  <Link href={itemHref(item)} className="font-semibold [overflow-wrap:anywhere] text-link hover:underline">
                    {item.title}
                  </Link>
                  <p className="text-sm text-ink-soft">
                    {[typeLabel(item.itemType), item.collection, relativeDay(item.createdAt, now)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <nav aria-label="Your lists" className="grid gap-x-5 gap-y-6 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-4">
          {lists.map((list) => (
            <Link
              key={list.href}
              href={list.href}
              data-doodle={list.doodle}
              className={`paste border-ink p-3 ${list.look}`}
              style={tilt(list.deg)}
            >
              <span className="hand-title block text-lg">{list.label}</span>
              <span className="block text-sm">{list.detail}</span>
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
