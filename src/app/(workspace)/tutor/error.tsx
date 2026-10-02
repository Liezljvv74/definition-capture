"use client";

/** Shown when the tutor's allowance or settings could not be read; `retry` is this Next version's name for re-fetching, as in `home/error.tsx`. */
export default function TutorError({ retry }: { retry: () => void }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <div className="card p-6">
        <h1 className="text-xl font-semibold">The tutor could not load</h1>
        <button type="button" className="btn btn-primary mt-4" onClick={retry}>
          Try again
        </button>
      </div>
    </main>
  );
}
