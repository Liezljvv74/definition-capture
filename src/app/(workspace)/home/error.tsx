"use client";

/**
 * Shown when the dashboard's data could not be read. One sentence and a way
 * to try again; the nav above still works, so every list stays reachable.
 *
 * This Next version names the recovery prop `retry`, which re-fetches the
 * page's data; `reset` would only re-render without it.
 */
export default function HomeError({ retry }: { retry: () => void }) {
  return (
    <main className="notebook-page mx-auto w-full max-w-5xl flex-1 py-8">
      <div className="card relative tape p-6">
        <h1 className="hand-title text-2xl"><span className="marker">Your dashboard could not load</span></h1>
        <button type="button" className="btn btn-primary mt-4" onClick={retry}>
          Try again
        </button>
      </div>
    </main>
  );
}
