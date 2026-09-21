import Link from "next/link";

/**
 * A welcoming landing page that explains the purpose of the app and points
 * new users toward the main sections of the workspace.
 */
export default function HomePage() {
  return (
    <>
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Home</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <div className="space-y-8">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
            <p className="mb-3 text-sm font-medium uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-400">
              A language-learning companion
            </p>

            <h2 className="max-w-3xl whitespace-nowrap text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:text-4xl">
              Welcome to your personal language study system
            </h2>

            <div className="mt-5 max-w-3xl space-y-4 text-base leading-7 text-slate-700 dark:text-slate-300">
              <p>
                This app is an extension of <span className="font-semibold text-slate-900 dark:text-slate-100">The Ultimate Language Learning Companion</span>.
                It was born from my own experience as a language learner.
              </p>

              <p>
                Despite my best efforts to stay organised, I often found myself frustrated by
                scattered notes, unfinished ideas, and study materials spread across too many places.
                I kept thinking, “There must be a better way to bring all of this together.”
              </p>

              <p>
                I realised that many students — especially those learning through online courses,
                self-study, or mixed study routines — are dealing with the same problem. The system
                I built to make my own learning easier felt like something worth sharing, so others
                could have a clearer, calmer, and more focused path to progress.
              </p>

              <p>
                The goal is simple: help you capture what matters, keep your vocabulary and phrases
                organised, and build a study routine that feels manageable instead of overwhelming.
              </p>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Link
              href="/terms"
              className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-500 dark:hover:bg-slate-800"
            >
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                Learn
              </p>
              <h3 className="mt-3 text-xl font-semibold text-slate-900 dark:text-slate-50">Terms</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Save words, definitions, references, and the ideas you want to keep close.
              </p>
            </Link>

            <Link
              href="/phrases"
              className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-500 dark:hover:bg-slate-800"
            >
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                Practise
              </p>
              <h3 className="mt-3 text-xl font-semibold text-slate-900 dark:text-slate-50">Phrases</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Gather useful expressions and sentence patterns that sound natural in real life.
              </p>
            </Link>

            <Link
              href="/verbs"
              className="rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-500 dark:hover:bg-slate-800"
            >
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                Structure
              </p>
              <h3 className="mt-3 text-xl font-semibold text-slate-900 dark:text-slate-50">Verbs</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Track conjugation patterns and keep the grammar pieces that matter most close at hand.
              </p>
            </Link>
          </section>
        </div>
      </main>
    </>
  );
}
