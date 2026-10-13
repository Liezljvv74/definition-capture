import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";

import { DemoVideo } from "@/components/DemoVideo";
import { Scribble } from "@/components/notebook/Scribble";

import { RememberCard } from "@/components/home/RememberCard";
import { ReviewCard } from "@/components/home/ReviewCard";
import { itemHref, progressParts, progressTotal, quoteFor, relativeDay, reviewState, typeLabel } from "@/lib/home";
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
/** A small hand-drawn star, the doodle's shape, filled with the highlighter. */
function Star({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden="true">
      <path
        d="M50 6 L61 37 L94 39 L68 60 L77 93 L50 75 L23 93 L32 60 L6 39 L39 37 Z"
        fill="var(--color-marker)"
        stroke="var(--color-ink)"
        strokeWidth="6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function HomePage() {
  const { name, summary, recent, remember } = await loadHome();
  const now = new Date();
  const parts = progressParts(summary);
  const totalCards = progressTotal(summary);


  return (
    <main className="notebook-page mx-auto w-full max-w-5xl flex-1 py-6 sm:py-8">
      {/* Sized to fit one laptop window, at the owner's request: progress
          sits beside the welcome rather than in a row of its own. */}
      <div className="grid gap-x-6 gap-y-8 lg:grid-cols-3">
        <div className={`self-center ${totalCards > 0 ? "lg:col-span-2" : "lg:col-span-3"}`}>
          <h1 className="hand-title text-2xl [overflow-wrap:anywhere] sm:text-3xl">
            Welcome back, <Scribble>{name}</Scribble>
          </h1>
          {summary.lastSavedAt && (
            <p className="mt-1 text-sm text-ink-soft">
              Last saved {relativeDay(summary.lastSavedAt, now)}. Here is where you left off.
            </p>
          )}
        </div>

        {totalCards > 0 && (
          <section aria-labelledby="progress-heading" className="paste rounded-[6px_14px_8px_12px] border-[3px] border-ink bg-card px-3.5 py-2 shadow-[3px_4px_0_var(--color-shadow)]"
            style={tilt(-0.5)}
          >
            {/* Stars rather than tape, so the progress stands out. Outside the
                corners, never over the text. */}
            <Star className="absolute -top-4 -left-4 size-7 -rotate-12" />
            <Star className="absolute -top-3 -right-3 size-5 rotate-12" />
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="progress-heading" className="hand-title text-base">Your progress</h2>
              <p className="text-xs text-ink-soft">{totalCards} items</p>
            </div>
            <div
              role="img"
              aria-label={parts.map((p) => `${p.count} ${p.label.toLowerCase()}`).join(", ")}
              className="mt-0.5 flex h-2.5 gap-0.5 overflow-hidden rounded-full border-[1.5px] border-ink"
            >
              {parts
                .filter((p) => p.count > 0)
                .map((p) => (
                  <div key={p.label} className={p.className} style={{ width: `${p.percent}%` }} />
                ))}
            </div>
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
              {parts.map((p) => (
                <li key={p.label} className="flex items-center gap-1.5">
                  <span aria-hidden="true" className={`size-2.5 rounded-sm border border-ink ${p.className}`} />
                  {p.label} {p.count}
                </li>
              ))}
            </ul>
          </section>
        )}

        <ReviewCard
          state={reviewState(summary, now)}
          quote={quoteFor(now)}
          verbs={{ due: summary.verbTensesDue, fresh: summary.verbTensesNew }}
          className="lg:col-span-2"
        />

        {remember && <RememberCard item={remember} />}

        {recent.length > 0 && (
          <section aria-labelledby="recent-heading" className="paste tape tape-pink rounded-[4px] border-[1.5px] border-dashed border-ink-soft bg-card px-4 py-3 shadow-[2px_3px_8px_rgb(0_0_0/0.18)] lg:col-span-3"
            style={tilt(0.6)}
          >
            <h2 id="recent-heading" className="hand-title text-lg">Recently captured</h2>
            <ul className="mt-2 grid gap-x-8 sm:grid-cols-2">
              {recent.map((item) => (
                <li key={item.id} className="flex items-baseline gap-2 border-t-[1.5px] border-dashed border-rule py-1.5">
                  <Link href={itemHref(item)} className="min-w-0 truncate font-semibold text-link hover:underline">
                    {item.title}
                  </Link>
                  <p className="min-w-0 truncate text-sm text-ink-soft">
                    {[typeLabel(item.itemType), item.collection, relativeDay(item.createdAt, now)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="lg:col-span-3">
          <DemoVideo headingId="demo-heading" tilt={0.4} />
        </div>
      </div>
    </main>
  );
}
