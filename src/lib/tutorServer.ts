/**
 * The reads, the writes and the OpenRouter calls of the tutor's routes.
 * Server only: this is the one module that reads OPENROUTER_API_KEY and
 * TUTOR_SIGNING_SECRET, which are never logged or sent back, and it imports no
 * browser code.
 *
 * Every call runs under the caller's own session, so row level security
 * scopes each query to that account. The plan comes from `account_plans`,
 * which the browser can read but never write, and never from the request.
 */

// A build error, not a leak, if a browser component ever imports this module:
// it reads OPENROUTER_API_KEY and TUTOR_SIGNING_SECRET.
import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import {
  answerText,
  DEFAULT_TUTOR_MODEL,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  readStoredReply,
  SEARCHES_PER_HOUR,
  startOfUtcDay,
  type Plan,
  type SearchRow,
  type StoredExchange,
  type TutorExchange,
  type TutorReply,
} from "@/lib/tutor";

type TutorSettings = {
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

/*
 * Replies the model really gave. Earlier exchanges reach the model from places
 * a user can write: the rows an account may insert itself with the publishable
 * key. A made-up reply agreeing to drop the rules is the usual way to talk a
 * model out of them. So each reply is signed when the server gets it, and an
 * earlier reply goes back to the model only if its signature verifies; the
 * user's own questions need none, being the user's words either way.
 *
 * The key is TUTOR_SIGNING_SECRET, a random string kept only in the server's
 * environment, and not derived from OPENROUTER_API_KEY: replacing that key
 * must not leave every older answer unverified. Changing this secret does:
 * older answers stay shown and searchable but stop being history, memory or
 * mergeable.
 */
function signingKey(): Buffer {
  return createHmac("sha256", process.env.TUTOR_SIGNING_SECRET ?? "").update("captured: reply signature v1").digest();
}

/** The signature of a reply to `userId`, so one account's signed reply is no use in another's history. */
export function signTurn(userId: string, content: string): string {
  return createHmac("sha256", signingKey()).update(`${userId}\n${content}`).digest("hex");
}

/** Whether `signature` is this server's for `content`, given to `userId`. */
export function signatureValid(userId: string, content: string, signature: string | null | undefined): boolean {
  // An unset secret would sign with an empty key, which anyone could reproduce, so nothing verifies.
  if (!process.env.TUTOR_SIGNING_SECRET) return false;
  const expected = Buffer.from(signTurn(userId, content), "hex");
  const given = Buffer.from(typeof signature === "string" ? signature : "", "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Saved exchanges whose answer this server signed for this account. A whole
 * exchange is dropped, question and all, so the model never sees a question
 * without the answer it was given.
 */
export function trustedExchanges<T extends { answerText: string; signature: string }>(userId: string, rows: T[]): T[] {
  return rows.filter((row) => signatureValid(userId, row.answerText, row.signature));
}

/** Checked before a reservation, so a missing key or signing secret does not spend a message. */
export function tutorConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY && process.env.TUTOR_SIGNING_SECRET);
}

function openRouterHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": SITE_URL,
    "X-Title": SITE_NAME,
  };
}

/**
 * One chat-completions call, returning the parsed JSON. Throws on a failed
 * status with only the status in the message, so a caller can log it without
 * logging anything the learner wrote. The caller sets the timeout because it
 * knows how much of the route's time is left.
 */
export async function askOpenRouter(body: Record<string, unknown>, timeoutMs = 55_000): Promise<unknown> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: openRouterHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenRouter answered ${res.status}`);
  return res.json();
}

/**
 * Vectors for `texts`, in order, from OpenRouter's embeddings endpoint with
 * the same key as the tutor. The reply is untrusted like any other: each
 * vector must have the column's dimension and only finite numbers, or the
 * insert would fail later with a less useful error.
 */
export async function embed(texts: string[], timeoutMs = 5_000): Promise<number[][]> {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    // Short, as it runs inside the tutor's 55-second budget beside the model call.
    signal: AbortSignal.timeout(timeoutMs),
    headers: openRouterHeaders(),
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts, dimensions: EMBEDDING_DIMENSIONS }),
  });
  if (!res.ok) throw new Error(`OpenRouter embeddings answered ${res.status}`);
  const json = (await res.json()) as { data?: { index?: number; embedding?: unknown }[] } | null;
  const vectors = [...(json?.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((d) => d.embedding);
  const readable = (v: unknown): v is number[] =>
    Array.isArray(v) && v.length === EMBEDDING_DIMENSIONS && v.every((n) => typeof n === "number" && Number.isFinite(n));
  if (vectors.length !== texts.length || !vectors.every(readable)) throw new Error("embeddings unreadable");
  return vectors as number[][];
}

/** One text's vector, or null: a failed embedding costs ranking or memory, never an answer. */
export async function embedOrNull(text: string, timeoutMs = 5_000): Promise<number[] | null> {
  try {
    return (await embed([text], timeoutMs))[0];
  } catch (error) {
    console.error(`tutor: ${error instanceof Error ? error.message : "embedding failed"}`);
    return null;
  }
}

/*
 * Saved conversations, in tutor_conversations and tutor_exchanges. Row level
 * security scopes every call to the caller, so none filters by user.
 */

/** Answer text past this is cut before it is signed and saved; the table refuses longer. */
const SAVED_MESSAGE_MAX = 32000;

const EXCHANGE_COLUMNS = "id, conversation_id, kind, question, reply, answer_text, signature";

type ExchangeRow = {
  id: number;
  conversation_id: string;
  kind: "answer" | "merge";
  question: string;
  reply: unknown;
  answer_text: string;
  signature: string;
};

/** A row as an exchange, or null when its reply is unreadable (a row the account wrote itself). */
function toStored(row: ExchangeRow): StoredExchange | null {
  const reply = readStoredReply(row.reply);
  if (!reply) return null;
  return {
    id: Number(row.id),
    conversationId: row.conversation_id,
    kind: row.kind,
    question: row.question,
    reply,
    answerText: row.answer_text,
    signature: row.signature,
  };
}

const readable = (rows: ExchangeRow[]) => rows.map(toStored).filter((e): e is StoredExchange => e !== null);

// ponytail: the newest 200 only; page the sidebar if anyone keeps more.
export async function loadConversationList(supabase: SupabaseClient): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from("tutor_conversations")
    .select("id, name")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("conversations unavailable");
  return data as { id: string; name: string }[];
}

/** The conversation, or null when it is not the caller's or no longer exists. */
export async function loadConversationMeta(supabase: SupabaseClient, id: string): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase.from("tutor_conversations").select("id, name").eq("id", id).maybeSingle();
  if (error) throw new Error("conversation unavailable");
  return data as { id: string; name: string } | null;
}

// ponytail: reads a whole conversation for the page; page it if one grows to thousands of exchanges.
export async function loadExchanges(supabase: SupabaseClient, conversationId: string, latest?: number): Promise<StoredExchange[]> {
  let query = supabase
    .from("tutor_exchanges")
    .select(EXCHANGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("id", { ascending: latest === undefined });
  if (latest !== undefined) query = query.limit(latest);
  const { data, error } = await query;
  if (error) throw new Error("exchanges unavailable");
  const rows = readable(data as ExchangeRow[]);
  return latest === undefined ? rows : rows.reverse();
}

/** The exchanges of one conversation with these ids, in the order the ids were given; missing ones are left out. */
export async function loadExchangesById(supabase: SupabaseClient, conversationId: string, ids: number[]): Promise<StoredExchange[]> {
  const { data, error } = await supabase
    .from("tutor_exchanges")
    .select(EXCHANGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .in("id", ids);
  if (error) throw new Error("exchanges unavailable");
  const byId = new Map(readable(data as ExchangeRow[]).map((e) => [e.id, e]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/** The rules saved from a conversation, each with the answer it was saved from (null for a merged rule). */
export async function loadLinkedRules(
  supabase: SupabaseClient,
  conversationId: string,
): Promise<{ itemId: string; exchangeId: number | null }[]> {
  const { data, error } = await supabase
    .from("tutor_conversation_rules")
    .select("item_id, exchange_id")
    .eq("conversation_id", conversationId);
  if (error) throw new Error("linked rules unavailable");
  return (data as { item_id: string; exchange_id: number | null }[]).map((row) => ({
    itemId: row.item_id,
    exchangeId: row.exchange_id === null ? null : Number(row.exchange_id),
  }));
}

export async function createConversation(supabase: SupabaseClient, userId: string, name: string): Promise<string> {
  const { data, error } = await supabase.from("tutor_conversations").insert({ user_id: userId, name }).select("id").single();
  if (error || !data) throw new Error("conversation not created");
  return (data as { id: string }).id;
}

/**
 * Saves an exchange, signing the answer text the model will later be sent,
 * and marks the conversation as just used. The signature is made here, the
 * one place the text is fixed, so it always covers exactly what is stored.
 */
export async function saveTutorExchange(
  supabase: SupabaseClient,
  input: { userId: string; conversationId: string; kind: "answer" | "merge"; question: string; reply: TutorReply; embedding: number[] | null },
): Promise<TutorExchange> {
  const text = answerText(input.reply).slice(0, SAVED_MESSAGE_MAX);
  const { data, error } = await supabase
    .from("tutor_exchanges")
    .insert({
      conversation_id: input.conversationId,
      user_id: input.userId,
      kind: input.kind,
      question: input.question,
      reply: input.reply,
      answer_text: text,
      signature: signTurn(input.userId, text),
      // pgvector reads the text form "[0.1,0.2,...]", which is what JSON gives.
      embedding: input.embedding ? JSON.stringify(input.embedding) : null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("exchange not saved");
  // Only the sidebar's order depends on this, so a failure is logged, not thrown.
  const touched = await supabase.from("tutor_conversations").update({ updated_at: new Date().toISOString() }).eq("id", input.conversationId);
  if (touched.error) console.error("tutor: could not mark the conversation as used");
  return { id: Number((data as { id: number }).id), kind: input.kind, question: input.question, reply: input.reply, mergeable: true };
}

/** search_tutor's rows, best first. A null embedding searches by keyword only. */
export async function searchExchanges(
  supabase: SupabaseClient,
  query: string,
  embedding: number[] | null,
  count: number,
): Promise<SearchRow[]> {
  const { data, error } = await supabase.rpc("search_tutor", {
    query,
    // pgvector reads the text form "[0.1,0.2,...]" for a halfvec too.
    query_embedding: embedding ? JSON.stringify(embedding) : null,
    match_count: count,
  });
  if (error) throw new Error("search unavailable");
  type Row = { exchange_id: number; conversation_id: string; conversation_name: string; kind: "answer" | "merge"; question: string; answer_text: string; signature: string };
  return (data as Row[]).map((row) => ({
    id: Number(row.exchange_id),
    conversationId: row.conversation_id,
    conversationName: row.conversation_name,
    kind: row.kind,
    question: row.question,
    answerText: row.answer_text,
    signature: row.signature,
  }));
}

/**
 * How many exchanges and conversations the account holds, for refusing a
 * question at the limit before a message is spent; the database refuses the
 * row itself either way (enforce_row_limit).
 */
export async function countHeld(supabase: SupabaseClient): Promise<{ exchanges: number; conversations: number }> {
  const [exchanges, conversations] = await Promise.all([
    supabase.from("tutor_exchanges").select("id", { count: "exact", head: true }),
    supabase.from("tutor_conversations").select("id", { count: "exact", head: true }),
  ]);
  if (exchanges.error || conversations.error) throw new Error("held rows unavailable");
  return { exchanges: exchanges.count ?? 0, conversations: conversations.count ?? 0 };
}

/**
 * Records a sidebar search and says whether it is within the hourly limit,
 * the way reserveMessage spends a question: the row first, then the count, so
 * parallel searches each see the others. Throws when either fails, since a
 * failed count must not read as none made.
 */
export async function reserveSearch(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { error } = await supabase.from("tutor_searches").insert({ user_id: userId });
  if (error) throw new Error("search not recorded");
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count, error: countError } = await supabase
    .from("tutor_searches")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  if (countError) throw new Error("searches uncounted");
  return (count ?? 0) <= SEARCHES_PER_HOUR;
}
