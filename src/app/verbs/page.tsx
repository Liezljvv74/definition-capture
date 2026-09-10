"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useMemo, useState } from "react";

import { VerbTableCard } from "@/components/VerbTableCard";
import { MAX_LIST_LENGTH } from "@/lib/constants";
import { saveSettings } from "@/lib/settings";
import { compareText } from "@/lib/sortName";
import { readNameList } from "@/lib/types";
import { useSettings } from "@/lib/useSettings";
import { useVerbTables } from "@/lib/useVerbTables";
import { createVerbTable } from "@/lib/verbTables";

/**
 * The conjugation tables. Each is rolled up to its verb until opened, so the
 * page reads as a list of verbs rather than a wall of conjugations.
 *
 * Tables are made from a term's Edit screen, which sends the reader here with
 * `?new=<verb>`. Everything then happens on this page: the persons question
 * if it has not been answered, then the table, open and ready. The Edit
 * screen deliberately does none of it — a question about verbs in general
 * does not belong in a dialog about one word, and neither does being told
 * where to go next.
 */
export default function VerbsPage() {
  // `useSearchParams` needs a boundary to suspend against during prerender.
  return (
    <Suspense fallback={<VerbsShell />}>
      <VerbList />
    </Suspense>
  );
}

function VerbsShell({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Verbs</h1>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
    </>
  );
}

function VerbList() {
  const router = useRouter();
  const params = useSearchParams();
  const { tables, loaded } = useVerbTables();
  const { settings, loaded: settingsLoaded } = useSettings();

  /** A verb arriving from the Edit term screen, to be made if it is new. */
  const pending = (params.get("new") ?? "").trim();
  /** Either the verb just made, or one a link asked to open. */
  const wanted = (params.get("verb") ?? pending).trim().toLocaleLowerCase();

  const has = (verb: string) =>
    tables.some((table) => table.verb.toLocaleLowerCase() === verb.toLocaleLowerCase());

  const [query, setQuery] = useState("");

  const needsPersons = settings.verbPersons.length === 0;
  const makeNow = pending !== "" && loaded && settingsLoaded && !has(pending) && !needsPersons;

  useEffect(() => {
    if (!makeNow) return;
    // Writing to a store, not to this component's state — which is what an
    // effect is for. `createVerbTable` returns any existing table instead of
    // inserting, so a re-run cannot produce a second one.
    createVerbTable(pending, settings.verbPersons);
    // `?new=` has done its job. Swapping it for `?verb=` leaves the address
    // describing what is on screen, so a reload opens the table rather than
    // re-running a creation that is already done.
    router.replace(`/verbs?verb=${encodeURIComponent(pending)}`);
  }, [makeNow, pending, settings.verbPersons, router]);

  /** Alphabetical, and narrowed by the search box. */
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return tables
      .filter((table) => !needle || table.verb.toLocaleLowerCase().includes(needle))
      .sort((a, b) => compareText(a.verb, b.verb));
  }, [tables, query]);

  if (!loaded || !settingsLoaded) return <VerbsShell />;

  // The first table, and nobody has said who verbs conjugate for yet.
  if (pending !== "" && !has(pending) && needsPersons) {
    return (
      <VerbsShell>
        <AskPersons verb={pending} />
      </VerbsShell>
    );
  }

  if (tables.length === 0) {
    return (
      <VerbsShell>
        <div className="card mx-auto max-w-xl p-8 text-center">
          <div aria-hidden="true" className="mb-3 text-4xl">
            🧩
          </div>
          <h2 className="text-lg font-semibold">No conjugation tables yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
            Tables are made from a term you have already saved. Open a verb on{" "}
            <Link
              href="/terms"
              className="text-indigo-700 underline underline-offset-2 dark:text-indigo-300"
            >
              Terms
            </Link>
            , choose Edit, and use <strong className="font-semibold">Conjugation table</strong>.
          </p>
        </div>
      </VerbsShell>
    );
  }

  return (
    <VerbsShell>
      <div className="mb-3 w-full sm:w-1/2 lg:w-[12.5%] lg:min-w-44">
        <label htmlFor="verb-search" className="sr-only">
          Search verbs
        </label>
        <input
          id="verb-search"
          type="search"
          className="field"
          placeholder="Search verbs…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        {visible.length === tables.length
          ? `${tables.length} ${tables.length === 1 ? "verb" : "verbs"}`
          : `${visible.length} of ${tables.length} verbs`}
      </p>

      <div className="space-y-1.5">
        {visible.map((table) => {
          const targeted = table.verb.toLocaleLowerCase() === wanted;
          return (
            <VerbTableCard
              // The target is part of the key so that arriving at a verb
              // while already on this page remounts its card open. Without
              // it, `startOpen` is only ever read on the first mount and a
              // card already on screen would stay shut.
              key={`${table.id}:${targeted}`}
              table={table}
              startOpen={targeted}
            />
          );
        })}
      </div>

      {visible.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-600 dark:text-slate-300">
          No verb matches “{query.trim()}”.{" "}
          <button
            type="button"
            className="cursor-pointer text-indigo-700 underline underline-offset-2 dark:text-indigo-300"
            onClick={() => setQuery("")}
          >
            Clear the search
          </button>
        </p>
      )}
    </VerbsShell>
  );
}

/**
 * Asked once, before the first table exists. There is no default list to
 * ship: the language being studied is not the app's to assume.
 */
function AskPersons({ verb }: { verb: string }) {
  const field = useId();
  const [typed, setTyped] = useState("");

  function save() {
    // One per line is the quickest way to type six of them; the same reader
    // rules as everywhere else trim, drop blanks, and de-duplicate.
    const persons = readNameList(typed.split("\n"), MAX_LIST_LENGTH);
    if (persons.length === 0) return;
    saveSettings({ verbPersons: persons });
    // The table follows immediately, so the answer and the thing it was for
    // land together.
    createVerbTable(verb, persons);
  }

  return (
    <div className="card mx-auto max-w-xl p-5 sm:p-6">
      <h2 className="text-base font-semibold">
        Before the first table: who does a verb conjugate for?
      </h2>
      <label htmlFor={field} className="mt-1.5 block text-sm text-slate-600 dark:text-slate-300">
        One per line, in the order the rows should appear. This is asked once
        and used for every table after it — you can change it later under
        Settings.
      </label>
      <textarea
        id={field}
        autoFocus
        rows={6}
        className="field mt-2 resize-y font-mono text-sm"
        placeholder={"ich\ndu\ner/sie/es\nwir\nihr\nSie/sie"}
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={typed.trim() === ""}
          onClick={save}
        >
          Save and make the table for {verb}
        </button>
        <Link href="/terms" className="btn btn-secondary">
          Cancel
        </Link>
      </div>
    </div>
  );
}
