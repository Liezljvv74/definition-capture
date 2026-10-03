"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Modal } from "@/components/Modal";
import { plural } from "@/lib/home";
import { countedTenses, sessionPlan, tenseCount, type PracticeMode, type TenseRecord } from "@/lib/verbPractice";
import type { VerbTable } from "@/lib/types";

/**
 * Starts a verb practice session: which verbs (due, all, or chosen) and, for
 * all or chosen, which tenses. Due asks the tenses that are due; when nothing
 * is due the not-tried tenses are offered instead.
 */
export function PracticeDialog({
  tables,
  records,
  onClose,
}: {
  tables: readonly VerbTable[];
  records: readonly TenseRecord[];
  onClose: () => void;
}) {
  const router = useRouter();
  const ids = useId();
  const now = new Date();
  // Counted in tenses, since a due or new session asks tenses, not whole verbs.
  const tensesIn = (mode: PracticeMode) =>
    tenseCount(sessionPlan(tables, records, { mode, tenses: [], verbIds: [] }, now));
  const dueCount = tensesIn("due");
  const newCount = tensesIn("new");
  const allTenses = [...new Set(tables.flatMap(countedTenses))];

  const [mode, setMode] = useState<PracticeMode>(dueCount > 0 ? "due" : newCount > 0 ? "new" : "all");
  const [tenses, setTenses] = useState<string[]>(allTenses.slice(0, 1));
  const [verbIds, setVerbIds] = useState<string[]>([]);

  const plan = sessionPlan(tables, records, { mode, tenses, verbIds }, now);
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  function start() {
    const params = new URLSearchParams({ mode });
    if (mode === "all" || mode === "choose") params.set("tenses", tenses.map(encodeURIComponent).join(","));
    if (mode === "choose") params.set("verbs", verbIds.join(","));
    router.push(`/verbs/practise?${params.toString()}`);
  }

  const option = (value: PracticeMode, label: string, disabled = false) => (
    <label className={`flex items-center gap-2 text-sm ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input type="radio" name={`${ids}-mode`} className="size-4 accent-accent" checked={mode === value} disabled={disabled} onChange={() => setMode(value)} />
      {label}
    </label>
  );

  return (
    <Modal title="Practise verbs" onClose={onClose}>
      <div className="space-y-4">
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-sm font-medium">Which verbs</legend>
          {option("due", `Due for review (${dueCount})`, dueCount === 0)}
          {option("new", `Tenses not yet tried (${newCount})`, newCount === 0)}
          {option("all", "All verbs")}
          {option("choose", "Choose verbs")}
        </fieldset>

        {(mode === "all" || mode === "choose") && (
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-sm font-medium">Tenses</legend>
            {allTenses.map((tense) => (
              <label key={tense} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-accent" checked={tenses.includes(tense)} onChange={() => setTenses(toggle(tenses, tense))} />
                {tense}
              </label>
            ))}
          </fieldset>
        )}

        {mode === "choose" && (
          <fieldset className="max-h-48 space-y-1.5 overflow-y-auto">
            <legend className="mb-1 text-sm font-medium">Verbs</legend>
            {tables.map((table) => (
              <label key={table.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-accent" checked={verbIds.includes(table.id)} onChange={() => setVerbIds(toggle(verbIds, table.id))} />
                {table.verb}
              </label>
            ))}
          </fieldset>
        )}

        <p className="text-sm text-ink-soft">
          {plan.length === 0
            ? "Nothing to ask with these choices."
            : `${plural(plan.length, "verb", "verbs")}, ${plural(tenseCount(plan), "tense", "tenses")}.`}
        </p>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={plan.length === 0} onClick={start}>Start</button>
        </div>
      </div>
    </Modal>
  );
}
