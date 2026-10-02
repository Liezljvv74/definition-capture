import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { DESCRIPTION, FAQ, SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const KEEP = [
  { title: "Words", colour: "bg-card-blue", text: "A word, its definition, a reference, and the collections it belongs to." },
  { title: "Phrases", colour: "bg-card-green", text: "Expressions with their literal meaning and an example of how they are really used." },
  { title: "Verb tables", colour: "bg-card-purple", text: "Conjugations laid out by person and tense, in the tenses you choose." },
  { title: "Grammar rules", colour: "bg-card-sage", text: "Rules written your way, with tables and examples." },
];

/**
 * The public landing page, and the only page search engines and LLMs can
 * read: everything else is behind sign-in. Its job is to say plainly what the
 * app is, so the no-demo-speak rule that governs the app's own screens does
 * not apply here. Every sentence must stay true of the app; nothing about
 * price, which is undecided.
 *
 * Prerendered: it reads no session, so it is built once and served from the
 * edge. The proxy sends a signed-in visitor on to /home before this renders.
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
    <>
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <span className="flex items-center gap-2 font-semibold">
            <Image src="/captured-logo.png" alt="" width={32} height={32} priority />
            {SITE_NAME}
          </span>
          <Link href="/sign-in" className="text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-300">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6">
        <section className="py-16 sm:py-24">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Your personal glossary for learning a language
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700 dark:text-slate-300">
            Save the words, phrases, verb tables and grammar rules you meet, then review them with
            flashcards until they stick.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/sign-up" className="btn btn-primary px-6 py-3 text-base">Create an account</Link>
            <Link href="/sign-in" className="btn btn-secondary px-6 py-3 text-base">Sign in</Link>
          </div>
        </section>

        <section aria-labelledby="keep-heading" className="py-10">
          <h2 id="keep-heading" className="text-2xl font-semibold tracking-tight">What you can keep</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {KEEP.map((item) => (
              <li key={item.title} className={`rounded-2xl p-5 text-slate-900 ${item.colour}`}>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-800">{item.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="remember-heading" className="grid gap-4 py-10 lg:grid-cols-2">
          <div className="rounded-2xl bg-challenge p-6 text-slate-900">
            <h2 id="remember-heading" className="text-2xl font-semibold tracking-tight">How you remember it</h2>
            <p className="mt-3 leading-7 text-slate-800">
              Flashcards are made from what you saved. You type the meaning, and each card comes back
              for review when it is due, less often as you keep getting it right.
            </p>
          </div>
          <div className="card p-6">
            <h2 className="text-2xl font-semibold tracking-tight">Private to you</h2>
            <p className="mt-3 leading-7 text-slate-700 dark:text-slate-300">
              Your lists belong to your account and nobody else can read them. Back everything up to a
              file whenever you like.
            </p>
          </div>
        </section>

        <section aria-labelledby="faq-heading" className="py-10">
          <h2 id="faq-heading" className="text-2xl font-semibold tracking-tight">Questions</h2>
          <dl className="mt-6 divide-y divide-slate-200 dark:divide-slate-800">
            {FAQ.map(({ question, answer }) => (
              <div key={question} className="py-4">
                <dt className="font-semibold">{question}</dt>
                <dd className="mt-1 leading-7 text-slate-700 dark:text-slate-300">{answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="py-16 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">Start your glossary</h2>
          <Link href="/sign-up" className="btn btn-primary mt-6 px-6 py-3 text-base">Create an account</Link>
        </section>
      </main>

      <script
        type="application/ld+json"
        // Escaped so no answer text can close the script element early.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
    </>
  );
}
