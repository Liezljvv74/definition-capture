import Link from "next/link";

/**
 * A welcoming landing page that explains the purpose of the app and points
 * new users toward the main sections of the workspace.
 */
export default function HomePage() {
  return (
    <>
      <header className="border-b border-slate-300 bg-slate-200 dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Home</h1>
        </div>
      </header>

      {/* The marker `globals.css` looks for: on this page alone the logo
          comes forward, over the cards rather than behind them. */}
      <main data-home-page className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <div className="space-y-8">
          {/* Lighter than the three cards below, which is what makes this read
              as a heading rather than a fourth one. No dark variant: it is a
              light colour in both themes, so the heading stays dark either
              way. See `globals.css` for where the palette comes from. */}
          <section className="rounded-2xl bg-card-yellow p-6 shadow-sm sm:p-8">
            {/* One line where there is room for one. `whitespace-nowrap` on its
                own made the heading unbreakable at every width, and nothing in
                the app sets `overflow-x: hidden`, so below about 1280px it
                dragged the whole page sideways. */}
            <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-900 lg:whitespace-nowrap sm:text-4xl">
              Welcome to your personal language study system
            </h2>
          </section>

          {/*
           * One colour per list, in the logo's hues at about a third of its
           * saturation: the full-strength version read as something made for a
           * child. Hover dims by 5% rather than swapping in an indigo, which
           * would have had to sit against three different colours and suit
           * none of them.
           */}
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Link
              href="/vocabulary"
              className="rounded-2xl bg-card-blue p-5 transition hover:brightness-95"
            >
              <h3 className="text-xl font-semibold text-slate-900">Vocabulary</h3>
              <p className="mt-2 text-sm leading-6 text-slate-800">
                Save words, definitions, references, and the ideas you want to keep close.
              </p>
            </Link>

            <Link
              href="/phrases"
              className="rounded-2xl bg-card-green p-5 transition hover:brightness-95"
            >
              <h3 className="text-xl font-semibold text-slate-900">Phrases</h3>
              <p className="mt-2 text-sm leading-6 text-slate-800">
                Gather useful expressions and sentence patterns that sound natural in real life.
              </p>
            </Link>

            <Link
              href="/verbs"
              className="rounded-2xl bg-card-purple p-5 transition hover:brightness-95"
            >
              <h3 className="text-xl font-semibold text-slate-900">Verbs</h3>
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
