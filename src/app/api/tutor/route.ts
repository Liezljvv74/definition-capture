/**
 * POST /api/tutor: asks the grammar tutor one question.
 *
 * The key is read in `tutorServer.ts` alone, and never logged or sent back.
 * Nothing in the request is trusted for the plan, the user or the limits: the
 * session says who is asking, and the database says what they have used. Logs carry status codes and short
 * reasons only, never the learner's text or the reply.
 */

import { NextResponse } from "next/server";
import { languageName } from "@/lib/languages";
import { reserveMessage } from "@/lib/reserveMessage";
import { createSupabaseServerClient, serverUserId } from "@/lib/supabaseServer";
import { allowance, buildRequest, QUESTION_MAX, readHistory, readReply, REFERENCE_DOMAINS, tutorInstructions } from "@/lib/tutor";
import { askOpenRouter, loadRuleTitles, loadTutorState, openRouterConfigured, tutorModel } from "@/lib/tutorServer";

export const runtime = "nodejs";
export const maxDuration = 60;

/** `remaining` is sent only by failures after the reservation, which spent a message the client should see gone. */
const fail = (status: number, error: string, remaining?: number) =>
  NextResponse.json(remaining === undefined ? { error } : { error, remaining }, { status });

export async function POST(request: Request) {
  const userId = await serverUserId();
  const supabase = userId ? await createSupabaseServerClient() : null;
  if (!userId || !supabase) return fail(401, "signed_out");

  let body: { question?: unknown; history?: unknown; answerIn?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_request");
  }
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (question.length < 1 || question.length > QUESTION_MAX) return fail(400, "bad_request");
  const history = readHistory(body.history);
  const answerIn = body.answerIn === "native" ? "native" : "studied";

  if (!openRouterConfigured()) {
    console.error("tutor: OPENROUTER_API_KEY is not configured");
    return fail(502, "tutor_failed");
  }

  let state;
  try {
    state = await loadTutorState(supabase);
  } catch {
    console.error("tutor: could not read the account's state");
    return fail(502, "tutor_failed");
  }
  const { settings } = state;
  const studied = settings.language ? languageName(settings.language) : settings.languageOther.trim();
  // Both refusals come before the reservation, so a refusal never spends a message.
  if (!studied) return fail(403, "noLanguage");
  const before = allowance(state);
  if (before.reason !== "ok") return fail(403, before.reason);

  let left, reason;
  try {
    ({ left, reason } = await reserveMessage(supabase, userId, state.plan));
  } catch {
    console.error("tutor: could not reserve the question");
    return fail(502, "tutor_failed");
  }
  if (reason !== "ok") return fail(403, reason, left);

  const native = settings.nativeLanguage ? languageName(settings.nativeLanguage) : settings.nativeLanguageOther.trim();
  const answerName = answerIn === "native" && native ? native : studied;
  // A typed language has no code, so no reference sites and no search.
  const domains = REFERENCE_DOMAINS[settings.language] ?? [];

  // Without them the tutor still answers; it only cannot point to a saved rule or suggest one.
  let rules: string[] = [];
  try {
    rules = await loadRuleTitles(supabase);
  } catch {
    console.error("tutor: could not read the rule titles");
  }

  let reply;
  try {
    reply = readReply(
      await askOpenRouter(
        buildRequest({
          model: tutorModel(),
          instructions: tutorInstructions({ studied, answerIn: answerName, level: settings.level, grounded: domains.length > 0, rules }),
          history,
          question,
          domains,
        }),
      ),
      rules,
    );
  } catch (error) {
    console.error(`tutor: ${error instanceof Error ? error.message : "the OpenRouter call threw"}`);
    return fail(502, "tutor_failed", left);
  }
  if (!reply) {
    console.error("tutor: the reply was unreadable");
    return fail(502, "tutor_failed", left);
  }

  // ponytail: two requests racing can both be refused; the limit is never
  // exceeded. Failed answers count, by the owner's decision (2 October 2026).
  // Midnight UTC edge: a question reserved just before midnight and re-counted
  // just after can give a paid account one extra question that day.
  return NextResponse.json({ reply, remaining: left });
}
