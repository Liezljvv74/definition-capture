import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: `What ${SITE_NAME} stores, who handles it, and how to have it removed.`,
  alternates: { canonical: "/privacy" },
};

/** Who answers for the data. Germany puts every user under the GDPR, wherever they live. */
const CONTROLLER = "Liezl Fourie";
const CONTACT = "liezl.fourie@amplivine.world";
const UPDATED = "14 October 2026";

/**
 * The services that receive any of an account's data, and what each gets.
 * Written from the code, not from a template: when a call to a new service is
 * added, it belongs here in the same change.
 */
const PROCESSORS = [
  {
    name: "Supabase",
    what: "The database and sign-in. Everything listed above is stored here, in Ireland (EU).",
  },
  { name: "Vercel", what: "Hosts the site. Its servers see each request and keep short-lived logs." },
  {
    name: "OpenRouter",
    what: "Passes your tutor questions and the conversation so far to the AI models that answer them: Anthropic's Claude writes the answers, a Qwen model turns them into numbers for search, and Exa searches the web for sources.",
  },
  { name: "Cloudflare Turnstile", what: "Checks that sign-in, sign-up and password resets come from a person." },
  { name: "Resend", what: "Delivers feedback you send through the Feedback form, by email to the owner." },
];

/**
 * The privacy notice the GDPR audit of 13 October 2026 found missing. Public,
 * like the landing page: it has to be readable before anyone signs up.
 * Prerendered, since it reads no session.
 */
export default function PrivacyPage() {
  return (
    <>
      <header className="notebook-page mx-auto flex w-full max-w-6xl items-center justify-between pt-4">
        <Link href="/" className="hand-title flex items-center gap-2 text-xl">
          <Image src="/captured-logo.png" alt="" width={32} height={32} priority />
          {SITE_NAME}
        </Link>
      </header>

      <main className="notebook-page mx-auto w-full max-w-6xl flex-1 space-y-7 pt-8 pb-20 leading-7">
        <div>
          <h1 className="hand-title text-[clamp(2rem,4vw,2.6rem)] leading-tight">Privacy</h1>
          <p className="mt-1 text-sm text-ink-soft">Last updated {UPDATED}</p>
        </div>

        <section aria-labelledby="who">
          <h2 id="who" className="hand-title text-[1.45rem] leading-9">Who is responsible</h2>
          <p>
            {SITE_NAME} is run by {CONTROLLER}, in Germany, who is responsible for your data under the EU
            General Data Protection Regulation (GDPR). It applies to everyone who uses {SITE_NAME}, wherever
            you live. Questions and requests: <a href={`mailto:${CONTACT}`} className="text-link underline">{CONTACT}</a>.
          </p>
        </section>

        <section aria-labelledby="what">
          <h2 id="what" className="hand-title text-[1.45rem] leading-9">What is stored</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>Your email address, and your password in the form Supabase keeps it (never readable, not even by the owner).</li>
            <li>What you save: words, phrases, verb tables, grammar rules, collections and sources.</li>
            <li>Your flashcards and how each review went.</li>
            <li>Your tutor conversations: the questions you ask and the answers given.</li>
            <li>Your settings, such as the language you study.</li>
            <li>How many tutor questions and searches you have used, to keep within the limits.</li>
          </ul>
          <p className="mt-2">
            Only cookies needed to keep you signed in are set. There is no advertising, analytics or tracking.
          </p>
        </section>

        <section aria-labelledby="why">
          <h2 id="why" className="hand-title text-[1.45rem] leading-9">Why it is allowed</h2>
          <p>
            Your notes, conversations and account are kept because you asked for the service that keeps them
            (GDPR Article 6(1)(b), a contract). The captcha, server logs and replies to feedback rely on a
            legitimate interest in keeping the site safe and working (Article 6(1)(f)). Nothing is sold or used
            for advertising.
          </p>
        </section>

        <section aria-labelledby="who-else">
          <h2 id="who-else" className="hand-title text-[1.45rem] leading-9">Who else handles it</h2>
          <ul className="list-disc space-y-1 pl-6">
            {PROCESSORS.map((p) => (
              <li key={p.name}>
                <strong>{p.name}:</strong> {p.what}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            Some of these companies are in the United States, so data can leave the EU. Those transfers rely on
            the EU-US Data Privacy Framework or the European Commission&apos;s standard contractual clauses.
            Don&apos;t put anything in a tutor question you would not want an AI provider to see.
          </p>
        </section>

        <section aria-labelledby="how-long">
          <h2 id="how-long" className="hand-title text-[1.45rem] leading-9">How long it is kept</h2>
          <p>
            Until you delete your account. The log of tutor searches is cleared every night. Copies already sent
            to an AI provider or as a feedback email are kept under those providers&apos; own terms and the
            owner&apos;s inbox, and are not removed when you delete your account.
          </p>
        </section>

        <section aria-labelledby="rights">
          <h2 id="rights" className="hand-title text-[1.45rem] leading-9">Your rights</h2>
          <ul className="list-disc space-y-1 pl-6">
            <li>
              <strong>A copy of your data:</strong> Settings, Backup saves your words, phrases, verb tables and
              grammar rules to a file. For a copy of the rest, such as tutor conversations, write to the address
              below.
            </li>
            <li>
              <strong>Deletion:</strong> Settings, Delete my account removes your account and everything in it,
              at once.
            </li>
            <li>
              <strong>Anything else</strong>, such as access, correction, restriction or objection: write to{" "}
              <a href={`mailto:${CONTACT}`} className="text-link underline">{CONTACT}</a>.
            </li>
            <li>
              You can complain to a data protection authority, such as the one where you live or the one in
              Germany.
            </li>
          </ul>
        </section>
      </main>
    </>
  );
}
