/**
 * The reads, the one write and the OpenRouter call shared by the tutor and
 * conversation routes. Server only: this is the one module that reads
 * OPENROUTER_API_KEY, which is never logged or sent back, and it imports no
 * browser code.
 *
 * Every call runs under the caller's own session, so row level security
 * scopes each query to that account. The plan comes from `account_plans`,
 * which the browser can read but never write, and never from the request.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { DEFAULT_TUTOR_MODEL, startOfUtcDay, type Plan, type TutorTurn } from "@/lib/tutor";

export type TutorSettings = {
  language: string;
  languageOther: string;
  nativeLanguage: string;
  nativeLanguageOther: string;
  level: string;
};

/** Just the two usage counts, for the re-count after a question is reserved. */
export async function countUsage(supabase: SupabaseClient): Promise<{ usedTotal: number; usedToday: number }> {
  const day = startOfUtcDay(new Date()).toISOString();
  const [total, today] = await Promise.all([
    supabase.from("tutor_usage").select("id", { count: "exact", head: true }),
    supabase.from("tutor_usage").select("id", { count: "exact", head: true }).gte("created_at", day),
  ]);
  // A failed count must not read as zero used, which would hand out free questions.
  if (total.error || today.error) throw new Error("tutor usage unavailable");
  return { usedTotal: total.count ?? 0, usedToday: today.count ?? 0 };
}

export async function loadTutorState(
  supabase: SupabaseClient,
): Promise<{ plan: Plan; usedTotal: number; usedToday: number; settings: TutorSettings }> {
  const [plan, usage, settings] = await Promise.all([
    supabase.from("account_plans").select("plan").maybeSingle(),
    countUsage(supabase),
    supabase
      .from("user_settings")
      .select("language, language_other, native_language, native_language_other, level")
      .maybeSingle(),
  ]);
  if (plan.error || settings.error) throw new Error("tutor state unavailable");

  const s = settings.data;
  return {
    // No row means the account was never upgraded.
    plan: plan.data?.plan === "paid" ? "paid" : "free",
    ...usage,
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

/**
 * The titles of the account's grammar rules, most recently edited first, for
 * the tutor to point to or suggest linking to. Read here rather than taken
 * from the request, like everything else the route acts on.
 */
// ponytail: the newest 300 only; a learner with more would need a search instead of the whole list in the prompt.
export async function loadRuleTitles(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from("items")
    .select("title")
    .eq("item_type", "grammar")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (error) throw new Error("rule titles unavailable");
  return (data as { title: string }[]).map((row) => row.title);
}

/** Checked before a reservation, so a missing key does not spend a message. */
export function openRouterConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/**
 * One chat-completions call, returning the parsed JSON. Throws on a failed
 * status with only the status in the message, so a caller can log it without
 * logging anything the learner wrote.
 */
export async function askOpenRouter(body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(55_000),
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": SITE_URL,
      "X-Title": SITE_NAME,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenRouter answered ${res.status}`);
  return res.json();
}

/*
 * The one open conversation of an account, in `conversation_messages`. Row
 * level security scopes every call to the caller, so none filters by user.
 */

/** Reply text past this is cut before it is saved; the table refuses longer. */
export const SAVED_MESSAGE_MAX = 32000;

// ponytail: reads the whole conversation; page it if one grows to thousands of messages.
export async function loadConversation(supabase: SupabaseClient): Promise<TutorTurn[]> {
  const { data, error } = await supabase.from("conversation_messages").select("role, content").order("id");
  if (error) throw new Error("conversation unavailable");
  return data as TutorTurn[];
}

/** A question and its reply, in one insert so that one is never saved without the other. */
export async function saveExchange(supabase: SupabaseClient, userId: string, message: string, reply: string): Promise<void> {
  const { error } = await supabase.from("conversation_messages").insert([
    { user_id: userId, role: "user", content: message },
    { user_id: userId, role: "assistant", content: reply.slice(0, SAVED_MESSAGE_MAX) },
  ]);
  if (error) throw new Error("conversation not saved");
}

export async function clearConversation(supabase: SupabaseClient, userId: string): Promise<void> {
  // The filter is required by the client for a delete, and row level security would apply it anyway.
  const { error } = await supabase.from("conversation_messages").delete().eq("user_id", userId);
  if (error) throw new Error("conversation not cleared");
}
