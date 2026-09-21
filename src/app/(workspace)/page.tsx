import Link from "next/link";

/**
 * A welcoming landing page that explains the purpose of the app and points
 * new users toward the main sections of the workspace.
 */
export default function HomePage() {
  return (
    <>
      {/* No fill of its own, so the page colour runs behind it. A white bar
          across the top of a yellow page reads as an accident. The rule stays,
          because it is what separates this from the nav above it. */}
      <header className="border-b border-amber-200/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Home</h1>
        </div>
      </header>

      {/* The marker `globals.css` looks for: on this page alone the logo
          comes forward, over the cards rather than behind them. */}
      <main data-home-page className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <div className="space-y-8">
          {/* The logo's own yellow, and no dark variant: it is a light colour
              in both themes, so the heading on it stays dark either way. */}
          <section className="rounded-2xl bg-logo-yellow p-6 shadow-sm sm:p-8">
            <h2 className="max-w-3xl whitespace-nowrap text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Welcome to your personal language study system
            </h2>
          </section>

          {/*
           * One logo colour per card, each at half strength. Hover dims by 5%
           * rather than swapping in an indigo, which would have had to sit
           * against three different colours and suit none of them.
           */}
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Link
              href="/terms"
              className="rounded-2xl bg-logo-teal-50 p-5 transition hover:brightness-95"
            >
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-slate-700">
                Learn
              </p>
              <h3 className="mt-3 text-xl font-semibold text-slate-900">Terms</h3>
              <p className="mt-2 text-sm leading-6 text-slate-800">
                Save words, definitions, references, and the ideas you want to keep close.
              </p>
            </Link>

            <Link
              href="/phrases"
              className="rounded-2xl bg-logo-pink-50 p-5 transition hover:brightness-95"
            >
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-slate-700">
                Practise
              </p>
              <h3 className="mt-3 text-xl font-semibold text-slate-900">Phrases</h3>
              <p className="mt-2 text-sm leading-6 text-slate-800">
                Gather useful expressions and sentence patterns that sound natural in real life.
              </p>
            </Link>

            <Link
              href="/verbs"
              className="rounded-2xl bg-logo-purple-50 p-5 transition hover:brightness-95"
            >
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-slate-700">
                Structure
              </p>
              <h3 className="mt-3 text-xl font-semibold text-slate-900">Verbs</h3>
              <p className="mt-2 text-sm leading-6 text-slate-800">
                Track conjugation patterns.
              </p>
            </Link>
          </section>
        </div>
      </main>
    </>
  );
}
