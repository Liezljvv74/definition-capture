/**
 * The tutor route's reads and its one write. Server only: it holds nothing
 * secret itself, but it is written to run in a route handler and imports no
 * browser code.
 *
 * Every call runs under the caller's own session, so row level security
 * scopes each query to that account. The plan comes from `account_plans`,
 * which the browser can read but never write, and never from the request.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TUTOR_MODEL, startOfUtcDay, type Plan } from "@/lib/tutor";

export type TutorSettings = {
  language: string;
  languageOther: string;
  nativeLanguage: string;
  nativeLanguageOther: string;
  level: string;
};

export async function loadTutorState(
  supabase: SupabaseClient,
): Promise<{ plan: Plan; usedTotal: number; usedToday: number; settings: TutorSettings }> {
  const day = startOfUtcDay(new Date()).toISOString();
  const [plan, total, today, settings] = await Promise.all([
    supabase.from("account_plans").select("plan").maybeSingle(),
    supabase.from("tutor_usage").select("id", { count: "exact", head: true }),
    supabase.from("tutor_usage").select("id", { count: "exact", head: true }).gte("created_at", day),
    supabase
      .from("user_settings")
      .select("language, language_other, native_language, native_language_other, level")
      .maybeSingle(),
  ]);
  // A failed read must not fall through to "free with nothing used", which
  // would hand out unlimited questions while the database is unreachable.
  for (const r of [plan, total, today, settings]) if (r.error) throw new Error("tutor state unavailable");

  const s = settings.data;
  return {
    // No row means the account was never upgraded.
    plan: plan.data?.plan === "paid" ? "paid" : "free",
    usedTotal: total.count ?? 0,
    usedToday: today.count ?? 0,
    settings: {
      language: s?.language ?? "",
      languageOther: s?.language_other ?? "",
      nativeLanguage: s?.native_language ?? "",
      nativeLanguageOther: s?.native_language_other ?? "",
      level: s?.level ?? "",
    },
  };
}

export async function recordQuestion(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.from("tutor_usage").insert({ user_id: userId });
  if (error) throw new Error("tutor usage not recorded");
}

export function tutorModel(): string {
  return process.env.OPENROUTER_MODEL?.trim() || DEFAULT_TUTOR_MODEL;
}
