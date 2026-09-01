import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Phrases · Definition Capture",
  description: "Longer expressions and turns of phrase worth remembering.",
};

export default function PhrasesPage() {
  return (
    <>
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Phrases</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Longer expressions and turns of phrase worth remembering
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <div className="card mx-auto max-w-xl p-8 text-center">
          <div aria-hidden="true" className="mb-3 text-4xl">
            💬
          </div>
          <h2 className="text-lg font-semibold">Nothing here yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
            This page is where phrases will live — the multi-word expressions that do not fit
            neatly into a single glossary term. It is set up and reachable; the capture flow
            still needs to be built.
          </p>
          <Link href="/" className="btn btn-secondary mt-5">
            Back to the glossary
          </Link>
        </div>
      </main>
    </>
  );
}
