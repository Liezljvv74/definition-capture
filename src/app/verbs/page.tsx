/**
 * Verbs. A heading and nothing else yet — the shape is here so the route
 * exists and can be linked to while what goes on it is decided.
 *
 * No "use client" and no hooks: there is nothing here that needs the browser,
 * so it stays a server component and is prerendered into the static export
 * like every other route.
 */
export default function VerbsPage() {
  return (
    <>
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Verbs</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6" />
    </>
  );
}
