/**
 * POST /api/tutor: asks the grammar tutor one question.
 *
 * This is the only place OPENROUTER_API_KEY is read besides `tutorServer.ts`,
 * and it is never logged or sent back. Nothing in the request is trusted for
 * the plan, the user or the limits: the session says who is asking, and the
 * database says what they have used. Logs carry status codes and short
 * reasons only, never the learner's text or the reply.
 */

import { NextResponse } from "next/server";
import { languageName } from "@/lib/languages";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { createSupabaseServerClient, serverUserId } from "@/lib/supabaseServer";
import { allowance, buildRequest, QUESTION_MAX, readHistory, readReply, REFERENCE_DOMAINS, tutorInstructions } from "@/lib/tutor";
import { countUsage, loadTutorState, recordQuestion, tutorModel } from "@/lib/tutorServer";

export const runtime = "nodejs";
export const maxDuration = 60;

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

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

  // Checked before the reservation so a missing key does not spend a question.
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
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

  // Reserve, then count again. The row is this request's place in line: N
  // parallel requests each insert before any of them re-counts, so each sees
  // the others and the limit holds. Checking once and recording after the
  // call, as this once did, let every parallel request see the old count.
  try {
    await recordQuestion(supabase, userId);
  } catch {
    console.error("tutor: could not reserve the question");
    return fail(502, "tutor_failed");
  }
  let usage;
  try {
    usage = await countUsage(supabase);
  } catch {
    console.error("tutor: could not re-count the account's usage");
    return fail(502, "tutor_failed");
  }
  // These counts include the row just inserted and `allowance` wants what was
  // used before this request. A request that lost the race is refused and its
  // row stays: a spent reservation is not given back.
  const { remaining, reason } = allowance({
    plan: state.plan,
    usedTotal: usage.usedTotal - 1,
    usedToday: usage.usedToday - 1,
  });
  if (reason !== "ok") return fail(403, reason);

  const native = settings.nativeLanguage ? languageName(settings.nativeLanguage) : settings.nativeLanguageOther.trim();
  const answerName = answerIn === "native" && native ? native : studied;
  // A typed language has no code, so no reference sites and no search.
  const domains = REFERENCE_DOMAINS[settings.language] ?? [];

  let reply;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(55_000),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": SITE_URL,
        "X-Title": SITE_NAME,
      },
      body: JSON.stringify(
        buildRequest({
          model: tutorModel(),
          instructions: tutorInstructions({ studied, answerIn: answerName, level: settings.level, grounded: domains.length > 0 }),
          history,
          question,
          domains,
        }),
      ),
    });
    if (!res.ok) {
      console.error(`tutor: OpenRouter answered ${res.status}`);
      return fail(502, "tutor_failed");
    }
    reply = readReply(await res.json());
  } catch {
    console.error("tutor: the OpenRouter call threw");
    return fail(502, "tutor_failed");
  }
  if (!reply) {
    console.error("tutor: the reply was unreadable");
    return fail(502, "tutor_failed");
  }

  // ponytail: two requests racing can both be refused (fail closed), but
  // never both answered past the limit beyond the milliseconds between insert
  // and re-count. Failed answers count, by the owner's decision (2 October 2026).
  return NextResponse.json({ reply, remaining: remaining - 1 });
}
