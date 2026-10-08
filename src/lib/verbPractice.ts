// Pure: what a verb practice session asks, how an answer is marked, and what
// state a verb and its tenses are in. See Docs/verb-practice.md.

import { normaliseAnswer } from "@/lib/judgeAnswer";
import type { VerbTable } from "@/lib/types";

/** One tense's schedule, as read from `verb_tense_progress`. */
export type TenseRecord = { itemId: string; tense: string; streak: number; timesSeen: number; dueAt: string | null };

export type TenseMark = "learned" | "learning" | "missed" | "new";

/**
 * The tenses a verb is practised in: named ones with at least one form filled
 * in, in table order, each name once. An empty or unnamed column can never be
 * asked, so it must never stop a verb counting as learned.
 */
export function countedTenses(table: VerbTable): string[] {
  const seen = new Set<string>();
  return table.tenses.filter((tense, at) => {
    if (tense.trim() === "" || seen.has(tense)) return false;
    const filled = table.rows.some((row) => (row.conjugations[at] ?? "").trim() !== "");
    if (filled) seen.add(tense);
    return filled;
  });
}

export function recordFor(records: readonly TenseRecord[], itemId: string, tense: string): TenseRecord | undefined {
  return records.find((record) => record.itemId === itemId && record.tense === tense);
}

/** Learned at a streak of two, as flashcards; missed when the last answer was wrong. */
export function tenseMark(record: TenseRecord | undefined): TenseMark {
  if (!record || record.timesSeen === 0) return "new";
  if (record.streak >= 2) return "learned";
  if (record.streak === 0) return "missed";
  return "learning";
}

/** One verb as a session asks it: `cells[k]` is the form for `tenses[k]`, null when there is none to ask. */
export type PracticeVerb = {
  itemId: string;
  verb: string;
  tenses: string[];
  rows: { person: string; cells: (string | null)[] }[];
};

/** The verb with the chosen tenses it can be asked in, in table order; null when none. */
export function practiceVerb(table: VerbTable, tenses: readonly string[]): PracticeVerb | null {
  const asked = countedTenses(table).filter((tense) => tenses.includes(tense));
  if (asked.length === 0) return null;
  // The first column of each name that has a form: a repeated name (only an
  // old backup can bring one) may have an empty column first, and asking that
  // would record the tense as right with nothing typed.
  const columns = asked.map((tense) =>
    table.tenses.findIndex((name, at) => name === tense && table.rows.some((row) => (row.conjugations[at] ?? "").trim() !== "")),
  );
  return {
    itemId: table.id,
    verb: table.verb,
    tenses: asked,
    rows: table.rows.map((row) => ({
      person: row.person,
      cells: columns.map((at) => {
        const form = (row.conjugations[at] ?? "").trim();
        return form === "" ? null : form;
      }),
    })),
  };
}

/** How many tenses a session asks, across its verbs. */
export function tenseCount(plan: readonly PracticeVerb[]): number {
  return plan.reduce((n, verb) => n + verb.tenses.length, 0);
}

export type PracticeMode = "due" | "new" | "all" | "choose";

/**
 * The verbs a session asks, in the order of the list. Due asks exactly the
 * tenses that are due; new asks the tenses not yet tried; all and choose ask
 * the ticked tenses, of every verb or of the chosen ones.
 */
export function sessionPlan(
  tables: readonly VerbTable[],
  records: readonly TenseRecord[],
  request: { mode: PracticeMode; tenses: readonly string[]; verbIds: readonly string[] },
  now: Date,
): PracticeVerb[] {
  const plan: PracticeVerb[] = [];
  for (const table of tables) {
    if (request.mode === "choose" && !request.verbIds.includes(table.id)) continue;
    const tenses =
      request.mode === "due"
        ? countedTenses(table).filter((tense) => {
            const record = recordFor(records, table.id, tense);
            return tenseMark(record) !== "new" && record?.dueAt != null && new Date(record.dueAt) <= now;
          })
        : request.mode === "new"
          ? countedTenses(table).filter((tense) => tenseMark(recordFor(records, table.id, tense)) === "new")
          : request.tenses;
    const verb = practiceVerb(table, tenses);
    if (verb) plan.push(verb);
  }
  return plan;
}

/**
 * Whether a typed form is right. Capitals and punctuation do not count, the
 * account's separators offer alternatives ("bist/seid"), and accents do.
 * Exact otherwise: unlike a flashcard, a one-letter slip is not forgiven,
 * because the ending is what is being practised.
 */
export function markForm(typed: string, expected: string, separators: string): boolean {
  const given = normaliseAnswer(typed);
  if (given === "") return false;
  const whole = normaliseAnswer(expected);
  if (given === whole) return true;
  const characters = [...separators].filter((character) => character !== "(" && character !== ")");
  if (characters.length === 0) return false;
  const escaped = characters.map((character) => character.replace(/[\\^\]-]/g, "\\$&")).join("");
  return expected
    .split(new RegExp(`[${escaped}]`))
    .map(normaliseAnswer)
    .some((alternative) => alternative !== "" && alternative === given);
}

/** A tense is right only when every box asked in it is right. */
export function tenseRight(
  verb: PracticeVerb,
  tenseAt: number,
  answers: Readonly<Record<string, string>>,
  separators: string,
): boolean {
  return verb.rows.every((row, rowAt) => {
    const expected = row.cells[tenseAt];
    return expected === null || markForm(answers[`${rowAt}:${tenseAt}`] ?? "", expected, separators);
  });
}
