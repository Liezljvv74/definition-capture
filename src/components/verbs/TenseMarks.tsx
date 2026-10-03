import { countedTenses, recordFor, tenseMark, type TenseMark, type TenseRecord } from "@/lib/verbPractice";
import type { VerbTable } from "@/lib/types";

const SYMBOL: Record<TenseMark, string> = { learned: "✓", learning: "…", missed: "✗", new: "○" };
const WORD: Record<TenseMark, string> = { learned: "learned", learning: "learning", missed: "missed last time", new: "not tried" };

/**
 * Each counted tense of a verb with its practice mark, in ink: red is kept
 * for warnings.
 */
export function TenseMarks({ table, records }: { table: VerbTable; records: readonly TenseRecord[] }) {
  const tenses = countedTenses(table);
  if (tenses.length === 0) return null;
  const marks = tenses.map((tense) => ({ tense, mark: tenseMark(recordFor(records, table.id, tense)) }));
  const label = marks.map(({ tense, mark }) => `${tense} ${WORD[mark]}`).join(", ");
  return (
    <span className="flex flex-wrap gap-x-2 text-xs text-ink-soft" aria-label={label} title={label}>
      {marks.map(({ tense, mark }) => (
        <span key={tense} aria-hidden="true">
          {`${tense} ${SYMBOL[mark]}`}
        </span>
      ))}
    </span>
  );
}
