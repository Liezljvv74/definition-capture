/**
 * The landing page. A heading and nothing else yet.
 *
 * This route used to be the Terms list, which now lives at `/terms`. Anything
 * that pointed here to mean "the list" — the back-links on a term page, the
 * nav's active tab, the link from Settings — was moved with it, so the only
 * thing still meaning `/` is the logo and this page.
 */
export default function HomePage() {
  return (
    <>
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Home</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6" />
    </>
  );
}
