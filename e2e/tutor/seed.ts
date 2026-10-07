import { createHmac } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Ready-made conversations written straight into the local database, so the
 * tests cover the page without asking the tutor, which would cost money and
 * answer differently each run. Signed in as the E2E account, so row level
 * security applies exactly as it does to the app. The answers are signed
 * with TUTOR_SIGNING_SECRET from `.env.local`, as the server signs them, so
 * the page offers their tick boxes; `sign` repeats `signTurn` in
 * `src/lib/tutorServer.ts`, and if the two drift apart the tick-box test fails.
 */
function sign(userId: string, content: string): string {
  const secret = process.env.TUTOR_SIGNING_SECRET;
  if (!secret) throw new Error("Set TUTOR_SIGNING_SECRET in .env.local; the seeded answers are signed with it.");
  const key = createHmac("sha256", secret).update("captured: reply signature v1").digest();
  return createHmac("sha256", key).update(`${userId}\n${content}`).digest("hex");
}

let client: SupabaseClient | null = null;
const made: string[] = [];

async function supabase(): Promise<SupabaseClient> {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  // Never the live project: these tests add and delete rows.
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url)) {
    throw new Error("The tutor seed writes only to the local Supabase copy; set .env.development.local as CLAUDE.md describes.");
  }
  const db = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "", { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({
    email: process.env.E2E_EMAIL ?? "",
    password: process.env.E2E_PASSWORD ?? "",
  });
  if (error || !data.user) throw new Error("The seed could not sign in as the E2E account.");
  client = db;
  return db;
}

export async function seedConversation(
  name: string,
  answers: { question: string; title: string; text: string }[],
): Promise<{ id: string; exchangeIds: number[] }> {
  const db = await supabase();
  const userId = (await db.auth.getUser()).data.user!.id;
  const { data: conversation, error } = await db.from("tutor_conversations").insert({ user_id: userId, name }).select("id").single();
  if (error || !conversation) throw new Error(`seed conversation: ${error?.message}`);
  made.push(conversation.id);
  const { data: rows, error: rowsError } = await db
    .from("tutor_exchanges")
    .insert(
      answers.map((a) => ({
        conversation_id: conversation.id,
        user_id: userId,
        kind: "answer",
        question: a.question,
        reply: {
          title: a.title,
          topic: "Cases",
          blocks: [{ id: crypto.randomUUID(), kind: "text", text: a.text }],
          sources: [{ url: "https://www.duden.de/rechtschreibung/Dativ", title: "Duden" }],
          existingRule: null,
          relatedRules: [],
        },
        answer_text: `${a.title}\n${a.text}`,
        signature: sign(userId, `${a.title}\n${a.text}`),
      })),
    )
    .select("id");
  if (rowsError || !rows) throw new Error(`seed exchanges: ${rowsError?.message}`);
  return { id: conversation.id, exchangeIds: rows.map((r) => Number(r.id)) };
}

/** Deletes the seeded conversations (their exchanges and links go with them) and the rules the tests saved. */
export async function removeSeeded(ruleTitles: string[] = []): Promise<void> {
  const db = await supabase();
  // A leftover would show up in the next run's assertions, so a failed clean-up fails the test.
  if (made.length) {
    const { error } = await db.from("tutor_conversations").delete().in("id", made.splice(0));
    if (error) throw new Error(`removing seeded conversations: ${error.message}`);
  }
  if (ruleTitles.length) {
    const { error } = await db.from("items").delete().eq("item_type", "grammar").in("title", ruleTitles);
    if (error) throw new Error(`removing saved rules: ${error.message}`);
  }
}
