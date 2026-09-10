"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useId, useMemo, useState } from "react";

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
 * `?new=<verb>`. Everything then happens on this page — the tense, and the
 * persons if they have never been given — because a question about verbs in
 * general does not belong in a dialog about one word.
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
  const params = useSearchParams();
  const { tables, loaded } = useVerbTables();
  const { loaded: settingsLoaded } = useSettings();
  const [query, setQuery] = useState("");

  /** A verb arriving from the Edit term screen, still to be made. */
  const pending = (params.get("new") ?? "").trim();
  /** Either the verb just made, or one a link asked to open. */
  const wanted = (params.get("verb") ?? pending).trim().toLocaleLowerCase();

  const has = (verb: string) =>
    tables.some((table) => table.verb.toLocaleLowerCase() === verb.toLocaleLowerCase());

  /** Alphabetical, and narrowed by the search box. */
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return tables
      .filter((table) => !needle || table.verb.toLocaleLowerCase().includes(needle))
      .sort((a, b) => compareText(a.verb, b.verb));
  }, [tables, query]);

  if (!loaded || !settingsLoaded) return <VerbsShell />;

  // A verb on its way in: ask what is needed, then make it.
  if (pending !== "" && !has(pending)) {
    return (
      <VerbsShell>
        <NewTableForm verb={pending} />
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
        <p className="py-6 text-sm text-slate-600 dark:text-slate-300">
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

/** The dropdown value meaning "none of these, let me type one". */
const ANOTHER = " another";

/**
 * Everything a new table needs, asked in one place: the tense always, and
 * the persons the first time. Both answers are kept, so the second table is
 * a dropdown and the third is barely a pause.
 */
function NewTableForm({ verb }: { verb: string }) {
  const router = useRouter();
  const ids = useId();
  const { settings } = useSettings();

  const knownTenses = settings.verbTenses;
  const needsPersons = settings.verbPersons.length === 0;

  const [choice, setChoice] = useState(knownTenses[0] ?? ANOTHER);
  const [typedTense, setTypedTense] = useState("");
  const [typedPersons, setTypedPersons] = useState("");

  const tense = (choice === ANOTHER ? typedTense : choice).trim();
  const persons = needsPersons
    ? readNameList(typedPersons.split("\n"), MAX_LIST_LENGTH)
    : settings.verbPersons;
  const ready = tense !== "" && persons.length > 0;

  function make() {
    if (!ready) return;

    // A tense typed once is offered from then on. One already on the list
    // stays where it is: the order is the reader's.
    const known = knownTenses.some(
      (candidate) => candidate.toLocaleLowerCase() === tense.toLocaleLowerCase(),
    );
    const tenses = known ? knownTenses : [...knownTenses, tense];

    saveSettings(
      needsPersons ? { verbTenses: tenses, verbPersons: persons } : { verbTenses: tenses },
    );
    createVerbTable(verb, persons, tense);
    // The address should describe what is on screen, not the act that got
    // there, so a reload opens the table rather than offering to make it.
    router.replace(`/verbs?verb=${encodeURIComponent(verb)}`);
  }

  return (
    <div className="card mx-auto max-w-md p-5">
      <h2 className="text-base font-semibold">A conjugation table for {verb}</h2>

      <div className="mt-4">
        <label htmlFor={`${ids}-tense`} className="mb-1 block text-sm font-medium">
          Which tense is it for?
        </label>

        {knownTenses.length > 0 && (
          <select
            id={`${ids}-tense`}
            className="field"
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            {knownTenses.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            <option value={ANOTHER}>Another tense…</option>
          </select>
        )}

        {(knownTenses.length === 0 || choice === ANOTHER) && (
          <input
            id={knownTenses.length === 0 ? `${ids}-tense` : `${ids}-new-tense`}
            autoFocus
            className={`field ${knownTenses.length > 0 ? "mt-2" : ""}`}
            placeholder="e.g. Present"
            aria-label="A new tense"
            value={typedTense}
            onChange={(event) => setTypedTense(event.target.value)}
          />
        )}

        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Kept for next time, so you pick it from a list rather than typing it
          again.
        </p>
      </div>

      {needsPersons && (
        <div className="mt-4">
          <label htmlFor={`${ids}-persons`} className="mb-1 block text-sm font-medium">
            Who does a verb conjugate for?
          </label>
          <textarea
            id={`${ids}-persons`}
            rows={6}
            className="field resize-y font-mono text-sm"
            placeholder={"ich\ndu\ner/sie/es\nwir\nihr\nSie/sie"}
            value={typedPersons}
            onChange={(event) => setTypedPersons(event.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            One per line, in the order the rows should appear. Asked once and
            used for every table after this; editable later under Settings.
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={!ready} onClick={make}>
          Make the table
        </button>
        <Link href="/terms" className="btn btn-secondary">
          Cancel
        </Link>
      </div>
    </div>
  );
}
