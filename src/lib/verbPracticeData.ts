// Reads and writes verb practice results: tense records through the browser
// client under RLS, results through `record_tense_review`, the way flashcards
// use `record_review`. See Docs/verb-practice.md.

import { readError } from "@/lib/remoteStore";
import { getSupabase } from "@/lib/supabaseClient";
import type { TenseRecord } from "@/lib/verbPractice";

export function readTenseRecord(row: unknown): TenseRecord | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.item_id !== "string" || typeof r.tense !== "string") return null;
  return {
    itemId: r.item_id,
    tense: r.tense,
    streak: typeof r.streak === "number" ? r.streak : 0,
    timesSeen: typeof r.times_seen === "number" ? r.times_seen : 0,
    dueAt: typeof r.due_at === "string" ? r.due_at : null,
  };
}

function client() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function loadTenseRecords(): Promise<TenseRecord[]> {
  const { data, error } = await client()
    .from("verb_tense_progress")
    .select("item_id, tense, streak, times_seen, due_at");
  if (error) throw new Error(`Could not load your verb practice: ${readError(error)}.`);
  return (data ?? []).map(readTenseRecord).filter((record): record is TenseRecord => record !== null);
}

/** One tense's result: right when every box in it was right. */
export async function recordTense(itemId: string, tense: string, right: boolean, tookMs: number | null): Promise<void> {
  const { error } = await client().rpc("record_tense_review", {
    target_item: itemId,
    target_tense: tense,
    answer: right ? "correct" : "again",
    took_ms: tookMs,
  });
  if (error) throw new Error(`Could not record that answer: ${readError(error)}.`);
}

export type TenseResult = { tense: string; right: boolean };

/**
 * Records each tense of one verb on its own, so a failure on one does not
 * stop the others being saved, and hands back the ones that failed for the
 * page to offer again.
 */
export async function recordTenses(
  itemId: string,
  results: readonly TenseResult[],
  tookMs: number | null,
  record: (itemId: string, tense: string, right: boolean, tookMs: number | null) => Promise<void> = recordTense,
): Promise<TenseResult[]> {
  const outcomes = await Promise.allSettled(results.map((r) => record(itemId, r.tense, r.right, tookMs)));
  return results.filter((_, at) => outcomes[at].status === "rejected");
}
