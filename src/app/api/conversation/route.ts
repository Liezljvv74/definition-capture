/**
 * POST /api/conversation: one turn of a free conversation with the model.
 *
 * Built like `/api/tutor` and spending the same allowance, since every call
 * costs the same: the session says who is asking, the database what they have
 * used, and the key stays in `tutorServer.ts`. The client sends the earlier
 * turns, which is how a follow-up knows what "that" was; `readHistory` keeps
 * only user and assistant turns, so a forged system turn is dropped. Logs carry
 * status codes and short reasons only, never the text.
 *
 * Each answered exchange is also saved, so the page can show it after a
 * reload; DELETE clears it for a new conversation. What the model is sent
 * still comes from the client's turns, not from the saved ones.
 */

import { NextResponse } from "next/server";
import { languageName } from "@/lib/languages";
import { reserveMessage } from "@/lib/reserveMessage";
import { createSupabaseServerClient, serverUserId } from "@/lib/supabaseServer";
import { allowance, buildChatRequest, QUESTION_MAX, readChatReply, readHistory } from "@/lib/tutor";
import { askOpenRouter, clearConversation, loadTutorState, openRouterConfigured, saveExchange, tutorModel } from "@/lib/tutorServer";

export const runtime = "nodejs";
export const maxDuration = 60;

const fail = (status: number, error: string, remaining?: number) =>
  NextResponse.json(remaining === undefined ? { error } : { error, remaining }, { status });

export async function POST(request: Request) {
  const userId = await serverUserId();
  const supabase = userId ? await createSupabaseServerClient() : null;
  if (!userId || !supabase) return fail(401, "signed_out");

  let body: { message?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_request");
  }
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (message.length < 1 || message.length > QUESTION_MAX) return fail(400, "bad_request");

  if (!openRouterConfigured()) {
    console.error("conversation: OPENROUTER_API_KEY is not configured");
    return fail(502, "chat_failed");
  }

  let state;
  try {
    state = await loadTutorState(supabase);
  } catch {
    console.error("conversation: could not read the account's state");
    return fail(502, "chat_failed");
  }
  const before = allowance(state);
  if (before.reason !== "ok") return fail(403, before.reason);

  let left, reason;
  try {
    ({ left, reason } = await reserveMessage(supabase, userId, state.plan));
  } catch {
    console.error("conversation: could not reserve the message");
    return fail(502, "chat_failed");
  }
  if (reason !== "ok") return fail(403, reason, left);

  // The native language from Settings, as the tutor reads it; none set leaves the model to follow the person.
  const { nativeLanguage, nativeLanguageOther } = state.settings;
  const answerIn = (nativeLanguage ? languageName(nativeLanguage) : nativeLanguageOther.trim()) || null;

  let reply;
  try {
    reply = readChatReply(
      await askOpenRouter(buildChatRequest({ model: tutorModel(), answerIn, history: readHistory(body.history), message })),
    );
  } catch (error) {
    console.error(`conversation: ${error instanceof Error ? error.message : "the OpenRouter call threw"}`);
    return fail(502, "chat_failed", left);
  }
  if (!reply) {
    console.error("conversation: the reply was empty");
    return fail(502, "chat_failed", left);
  }
  // A reply that could not be saved is still shown: it was paid for, and the
  // client says it will not survive a reload.
  let saved = true;
  try {
    await saveExchange(supabase, userId, message, reply);
  } catch {
    console.error("conversation: could not save the exchange");
    saved = false;
  }
  return NextResponse.json({ reply, remaining: left, saved });
}

/** Starts a new conversation by deleting the saved one. */
export async function DELETE() {
  const userId = await serverUserId();
  const supabase = userId ? await createSupabaseServerClient() : null;
  if (!userId || !supabase) return fail(401, "signed_out");
  try {
    await clearConversation(supabase, userId);
  } catch {
    console.error("conversation: could not clear the conversation");
    return fail(502, "clear_failed");
  }
  return new NextResponse(null, { status: 204 });
}
