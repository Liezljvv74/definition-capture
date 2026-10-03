"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";

import { celebrate, reducedMotion } from "@/components/notebook/doodles";
import { useSettings } from "@/lib/useSettings";
import { useTenseRecords } from "@/lib/useTenseRecords";
import { useVerbTables } from "@/lib/useVerbTables";
import { markForm, sessionPlan, tenseRight, type PracticeMode, type PracticeVerb } from "@/lib/verbPractice";
import { recordTenses, type TenseResult } from "@/lib/verbPracticeData";

const MODES: PracticeMode[] = ["due", "new", "all", "choose"];

export default function PractisePage() {
  return (
    <Suspense fallback={null}>
      <Practise />
    </Suspense>
  );
}

function Practise() {
  const params = useSearchParams();
  const { tables, loaded: tablesLoaded, error: tablesError } = useVerbTables();
  const { records, loaded: recordsLoaded, error } = useTenseRecords();

  if (!tablesLoaded || !recordsLoaded) {
    return <main className="notebook-page mx-auto w-full max-w-4xl flex-1 py-8"><div className="card h-48 animate-pulse" aria-hidden="true" /></main>;
  }

  const mode = (MODES.find((m) => m === params.get("mode")) ?? "due") as PracticeMode;
  const tenses = (params.get("tenses") ?? "").split(",").filter(Boolean).map(decodeURIComponent);
  const verbIds = (params.get("verbs") ?? "").split(",").filter(Boolean);
  const plan = sessionPlan(tables, records, { mode, tenses, verbIds }, new Date());

  // Mounted once with the plan, so recording results (which changes the
  // records) never changes the verbs this session asks.
  return <Session plan={plan} loadError={error ?? tablesError} />;
}

function Session({ plan: initial, loadError }: { plan: PracticeVerb[]; loadError: string | null }) {
  const { settings } = useSettings();
  const [plan] = useState(initial);
  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const [missed, setMissed] = useState<{ verb: string; tense: string }[]>([]);
  const [rightTenses, setRightTenses] = useState(0);
  const [failure] = useState<string | null>(loadError);
  // Results that could not be saved, kept so they can be sent again.
  const [unsaved, setUnsaved] = useState<{ results: TenseResult[]; took: number } | null>(null);
  const [message, setMessage] = useState("");
  // When the current verb was shown, for the answer time recorded with it.
  const [shownAt, setShownAt] = useState(() => Date.now());
  const card = useRef<HTMLDivElement>(null);

  if (plan.length === 0) {
    return (
      <main className="notebook-page mx-auto w-full max-w-4xl flex-1 py-8">
        <div className="card p-6 text-center">
          {/* A failed load leaves nothing to plan from; say so, rather than
              that there is nothing to practise. */}
          {loadError ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">{loadError}</p>
          ) : (
            <h1 className="hand-title text-xl">Nothing to practise</h1>
          )}
          <Link href="/verbs" className="btn btn-primary mt-4 inline-block">Back to Verbs</Link>
        </div>
      </main>
    );
  }

  if (at >= plan.length) {
    const total = plan.reduce((n, v) => n + v.tenses.length, 0);
    return (
      <main className="notebook-page mx-auto w-full max-w-4xl flex-1 py-8">
        <div className="card p-6">
          <h1 className="hand-title text-2xl"><span className="marker section-purple">Practice finished</span></h1>
          <p className="mt-2">{rightTenses} of {total} tenses right.</p>
          {missed.length > 0 && (
            <>
              <h2 className="mt-4 text-sm font-semibold tracking-wide text-ink-soft uppercase">To look at again</h2>
              <ul className="mt-1 space-y-1">
                {missed.map(({ verb, tense }) => (
                  <li key={`${verb}:${tense}`}>
                    <Link href={`/verbs?verb=${encodeURIComponent(verb)}`} className="text-link underline">{verb}</Link>{" "}
                    <span className="text-ink-soft">{tense}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Link href="/verbs" className="btn btn-primary mt-5 inline-block">Back to Verbs</Link>
        </div>
      </main>
    );
  }

  const verb = plan[at];
  const separators = settings.answerSeparators;

  async function check() {
    setChecked(true);
    const took = Date.now() - shownAt;
    const results = verb.tenses.map((tense, k) => ({ tense, right: tenseRight(verb, k, answers, separators) }));
    const allRight = results.every((r) => r.right);
    setRightTenses((n) => n + results.filter((r) => r.right).length);
    setMissed((list) => [...list, ...results.filter((r) => !r.right).map((r) => ({ verb: verb.verb, tense: r.tense }))]);
    setMessage(allRight ? "All right." : "Not all right. The right forms are shown.");
    const el = card.current;
    if (el && !reducedMotion()) {
      if (allRight) celebrate(el);
      else {
        el.classList.remove("wobble");
        void el.offsetWidth;
        el.classList.add("wobble");
      }
    }
    const failed = await recordTenses(verb.itemId, results, took);
    setUnsaved(failed.length > 0 ? { results: failed, took } : null);
  }

  async function retry() {
    if (!unsaved) return;
    const failed = await recordTenses(verb.itemId, unsaved.results, unsaved.took);
    setUnsaved(failed.length > 0 ? { results: failed, took: unsaved.took } : null);
  }

  function next() {
    setAt((n) => n + 1);
    setAnswers({});
    setChecked(false);
    setMessage("");
    setUnsaved(null);
    setShownAt(Date.now());
  }

  return (
    <main className="notebook-page mx-auto w-full max-w-4xl flex-1 py-8">
      <p className="text-sm text-ink-soft">Verb {at + 1} of {plan.length}</p>
      <div ref={card} className="card mt-2 p-4 sm:p-6 [--wobble-r:0deg]">
        <h1 className="hand-title text-2xl"><span className="marker section-purple">{verb.verb}</span></h1>
        {/* Scrolls sideways inside itself on a phone, never the page. */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                <th scope="col" className="w-28 px-1.5 py-1.5 font-semibold">Person</th>
                {verb.tenses.map((tense) => (
                  <th key={tense} scope="col" className="min-w-36 px-1.5 py-1.5 font-semibold">{tense}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {verb.rows.map((row, r) => (
                <tr key={r}>
                  <th scope="row" className="px-1.5 py-1 font-medium">{row.person}</th>
                  {row.cells.map((expected, k) => {
                    const key = `${r}:${k}`;
                    if (expected === null) return <td key={k} className="px-1.5 py-1 text-ink-soft">-</td>;
                    const right = checked && markForm(answers[key] ?? "", expected, separators);
                    return (
                      <td key={k} className="px-1.5 py-1 align-top">
                        <label htmlFor={`cell-${key}`} className="sr-only">{`${verb.tenses[k]} for ${row.person}`}</label>
                        <input
                          id={`cell-${key}`}
                          className={`field !px-2 !py-1 text-sm ${checked ? (right ? "!border-emerald-600" : "!border-red-600") : ""}`}
                          value={answers[key] ?? ""}
                          readOnly={checked}
                          autoComplete="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          onChange={(event) => setAnswers((all) => ({ ...all, [key]: event.target.value }))}
                        />
                        {checked && !right && <span className="mt-0.5 block text-xs text-ink">{expected}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p aria-live="polite" className="mt-3 min-h-6 text-sm">{message}</p>
        {failure && <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-300">{failure}</p>}
        {unsaved && (
          <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-300">
            Could not save {unsaved.results.map((r) => r.tense).join(", ")}.{" "}
            <button type="button" className="link-button" onClick={() => void retry()}>
              Try again
            </button>
          </p>
        )}

        <div className="mt-3 flex gap-2">
          {!checked ? (
            <button type="button" className="btn btn-primary" onClick={() => void check()}>Check</button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={next}>{at + 1 < plan.length ? "Next verb" : "Finish"}</button>
          )}
          <Link href="/verbs" className="btn btn-secondary">Leave</Link>
        </div>
      </div>
    </main>
  );
}
