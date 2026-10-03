import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

import { NotebookDoodles } from "@/components/notebook/NotebookDoodles";
import { NotebookPaper } from "@/components/notebook/NotebookPaper";
import { Scribble } from "@/components/notebook/Scribble";
import { TryOneNow } from "@/components/notebook/TryOneNow";
import { DESCRIPTION, FAQ, SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/** A paste block's tilt, which notebook.css reads from `--r`. */
const tilt = (deg: number) => ({ "--r": `${deg}deg` }) as CSSProperties;

/*
 * The four tiles, each pasted on differently so no two neighbours match:
 * tilt, border weight, corners, shadow and tape all vary, after the mock-up.
 * `doodle` is what hovering or tapping draws in the tile's corner.
 */
const KEEP = [
  {
    title: "Words",
    text: "A word, its definition, a reference, and the collections it belongs to.",
    look: "bg-tile-blue border-[3px] rounded-[4px_12px_3px_10px] shadow-[4px_5px_0_var(--color-shadow)] tape tape-right",
    deg: -1.8,
    doodle: "star",
  },
  {
    title: "Phrases",
    text: "Expressions with their literal meaning and an example of how they are really used.",
    look: "bg-tile-green border-[1.5px] rounded-[10px_3px_12px_4px] shadow-[2px_3px_0_var(--color-shadow)]",
    deg: 1.4,
    doodle: "heart",
  },
  {
    title: "Verb tables",
    text: "Conjugations laid out by person and tense, in the tenses you choose.",
    look: "bg-tile-purple border-2 rounded-[3px_10px_4px_12px] shadow-[3px_4px_0_var(--color-shadow)] tape tape-centre",
    deg: 1.2,
    doodle: "spiral",
  },
  {
    title: "Grammar rules",
    text: "Rules written your way, with tables and examples.",
    look: "bg-tile-sage border-[3.5px] rounded-[12px_4px_10px_3px] shadow-[5px_5px_0_var(--color-shadow)]",
    deg: -1.1,
    doodle: "sparkle",
  },
];

/** Each question strip's tilt and border, so the column does not look stamped. */
const STRIPS = [
  { deg: 0.5, border: "border-2" },
  { deg: -0.7, border: "border-[3px]" },
  { deg: 0.9, border: "border-[1.5px]" },
  { deg: -0.4, border: "border-2" },
  { deg: 0.6, border: "border-[3px]" },
];

/**
 * The public landing page, and the only page search engines and LLMs can
 * read: everything else is behind sign-in. Its job is to say plainly what the
 * app is, so the no-demo-speak rule that governs the app's own screens does
 * not apply here. Every sentence must stay true of the app; nothing about
 * price, which is undecided.
 *
 * Drawn as a page of lined notebook paper (design/captured-notebook-mockup.html):
 * pasted-on blocks at slight angles, tape, a highlighter and doodles that draw
 * themselves. The copy is the live copy, not the mock-up's older wording.
 *
 * Prerendered: it reads no session, so it is built once and served from the
 * edge. Only `NotebookDoodles` runs in the browser. The proxy sends a
 * signed-in visitor on to /home before this renders.
 */
export default function LandingPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: SITE_NAME,
        url: SITE_URL,
        description: DESCRIPTION,
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web",
        inLanguage: "en",
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map(({ question, answer }) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      },
    ],
  };

  return (
    <NotebookPaper>
      <NotebookDoodles />

      <header className="notebook-page mx-auto flex w-full max-w-6xl items-center justify-between pt-4">
        <span className="hand-title flex items-center gap-2 text-xl">
          <Image src="/captured-logo.png" alt="" width={32} height={32} priority />
          {SITE_NAME}
        </span>
        <Link href="/sign-in" className="text-lg text-link underline decoration-2 underline-offset-4">
          Sign in
        </Link>
      </header>

      <main className="notebook-page mx-auto grid w-full max-w-6xl flex-1 gap-x-14 gap-y-9 pt-8 pb-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-8">
          <section>
            <h1 className="hand-title rotate-[-1.2deg] text-[clamp(2.1rem,4.6vw,3.2rem)] leading-[1.12] text-balance">
              Your personal <Scribble>repository</Scribble> for learning any language
            </h1>
            <p className="mt-4 max-w-[34ch] text-[1.12rem] leading-8 text-ink-soft">
              Save words, phrases, verb conjugations and grammar rules, and review them with{" "}
              <mark className="marker-low">flashcards</mark> until they stick.
            </p>
            <div className="mt-5 flex flex-wrap gap-3.5">
              <Link href="/sign-up" className="btn-hand btn-hand-primary" style={tilt(-1.5)}>
                Create an account
              </Link>
              <Link href="/sign-in" className="btn-hand btn-hand-ghost" style={tilt(1.2)}>
                Sign in
              </Link>
            </div>
          </section>

          <section
            aria-labelledby="remember-heading"
            className="paste tape tape-two rounded-[6px_14px_8px_12px] border-[3px] border-ink bg-tile-sky px-6 pt-5 pb-5 shadow-[5px_6px_0_var(--color-shadow)]"
            style={tilt(-0.9)}
          >
            <h2 id="remember-heading" className="hand-title text-[1.45rem] leading-9">
              How you remember it
            </h2>
            <p className="mt-1 leading-7">
              Flashcards are made from what you saved. You type the meaning, and each card comes back for review
              when it is due, less often as you keep getting it right.
            </p>
            <TryOneNow />
          </section>

          <section
            aria-labelledby="private-heading"
            className="paste tape tape-pink rounded-[4px] border-[1.5px] border-dashed border-ink-soft bg-card px-6 pt-6 pb-5 shadow-[2px_3px_8px_rgb(0_0_0/0.18)]"
            style={tilt(1.1)}
          >
            {/* A pair of scissors on the dashed edge: this piece was cut out. */}
            <svg className="absolute -top-[17px] right-[26px] size-[30px]" viewBox="0 0 40 40" aria-hidden="true">
              <g fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="9" cy="30" r="5" />
                <circle cx="9" cy="10" r="5" />
                <path d="M13 13 L36 28 M13 27 L36 12" />
              </g>
            </svg>
            <h2 id="private-heading" className="hand-title text-[1.45rem] leading-9">
              Private to you
            </h2>
            <p className="mt-1 leading-7">
              Your lists belong to your account and nobody else can read them. Back everything up to a file whenever
              you like.
            </p>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-8">
          <section aria-labelledby="keep-heading">
            <h2 id="keep-heading" className="hand-title mb-4 inline-block rotate-[-1.5deg] text-[1.45rem] leading-9">
              <span className="marker">Structured Notes</span>
            </h2>
            <ul className="grid grid-cols-1 gap-x-[18px] gap-y-5 sm:grid-cols-2">
              {KEEP.map((item) => (
                <li
                  key={item.title}
                  data-doodle={item.doodle}
                  className={`paste min-h-[132px] cursor-default border-ink px-4 pt-4 pb-[18px] ${item.look}`}
                  style={tilt(item.deg)}
                >
                  <h3 className="hand-title text-[1.3rem] leading-8">{item.title}</h3>
                  <p className="mt-1 text-[0.98rem] leading-6">{item.text}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="faq-heading">
            <h2 id="faq-heading" className="hand-title mt-2 mb-2 text-2xl leading-9">
              <Scribble colour="var(--color-margin)" shape="wiggle">
                Questions
              </Scribble>
            </h2>
            <div className="mt-3 space-y-3.5">
              {FAQ.map(({ question, answer }, at) => (
                <details key={question} className={`paper-strip group ${STRIPS[at % STRIPS.length].border}`} style={tilt(STRIPS[at % STRIPS.length].deg)}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 text-[1.12rem] leading-7 [&::-webkit-details-marker]:hidden">
                    {question}
                    <svg className="size-4 flex-none transition-transform group-open:rotate-180" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M3 5 L8 11 L13 5 Z" fill="currentColor" />
                    </svg>
                  </summary>
                  <p className="border-t-[1.5px] border-dashed border-rule px-4 pt-2.5 pb-3.5 leading-[26px] text-ink-soft">
                    {answer}
                  </p>
                </details>
              ))}
            </div>
          </section>
        </div>
      </main>

      <script
        type="application/ld+json"
        // Escaped so no answer text can close the script element early.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
    </NotebookPaper>
  );
}
