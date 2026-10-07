/**
 * POST /api/tutor/merge: one grammar rule from 2 to 10 ticked answers of a
 * saved conversation (Docs/tutor-conversations.md). It spends one message,
 * like a question, follows the Answer in switch, and searches the same
 * reference sites, which the model is told to use only to check and correct
 * what the answers say (the owner's decisions, 7 October 2026). The answers
 * are read from the database, under row level security, and only those whose
 * signature verifies are merged, so a row the account wrote itself never
 * reaches the model as one it gave. It keeps to the same 55-second budget as
 * a question (see /api/tutor).
 *
 * The rule is returned as a draft and not saved in the conversation (the
 * owner's decision, 7 October 2026): it becomes a grammar rule only when the
 * learner saves it, and otherwise goes away. Kept in the conversation, it
 * could be saved twice, and it filled the conversation with copies.
 */

import { NextResponse } from "next/server";
import { languageName } from "@/lib/languages";
import { reserveMessage } from "@/lib/reserveMessage";
import { createSupabaseServerClient, serverUserId } from "@/lib/supabaseServer";
import {
  allowance,
  buildRequest,
  MERGE_MIN,
  mergeQuestion,
  mergeSearch,
  onReferenceSite,
  mergeSources,
  readConversationId,
  readExchangeIds,
  readReply,
  REFERENCE_DOMAINS,
  tutorInstructions,
} from "@/lib/tutor";
import {
  askOpenRouter,
  loadConversationMeta,
  loadExchangesById,
  loadRuleTitles,
  loadTutorState,
  trustedExchanges,
  tutorConfigured,
  tutorModel,
} from "@/lib/tutorServer";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUDGET_MS = 55_000;
/** Kept back from the model to send the reply. */
const REPLY_MS = 2_000;

const fail = (status: number, error: string, remaining?: number) =>
  NextResponse.json(remaining === undefined ? { error } : { error, remaining }, { status });

export async function POST(request: Request) {
  const started = Date.now();
  const timeLeft = () => BUDGET_MS - (Date.now() - started);

  const userId = await serverUserId();
  const supabase = userId ? await createSupabaseServerClient() : null;
  if (!userId || !supabase) return fail(401, "signed_out");

  let body: { conversationId?: unknown; exchangeIds?: unknown; answerIn?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, "bad_request");
  }
  const conversationId = readConversationId(body?.conversationId);
  const ids = readExchangeIds(body?.exchangeIds);
  if (!conversationId || !ids) return fail(400, "bad_request");
  const answerIn = body.answerIn === "native" ? "native" : "studied";

  if (!tutorConfigured()) {
    console.error("merge: OPENROUTER_API_KEY or TUTOR_SIGNING_SECRET is not configured");
    return fail(502, "tutor_failed");
  }

  const rulesLoad = loadRuleTitles(supabase).catch(() => {
    console.error("merge: could not read the rule titles");
    return [] as string[];
  });

  let meta, state, answers;
  try {
    [meta, state, answers] = await Promise.all([
      loadConversationMeta(supabase, conversationId),
      loadTutorState(supabase),
      loadExchangesById(supabase, conversationId, ids),
    ]);
  } catch {
    console.error("merge: could not read the account's state or answers");
    return fail(502, "tutor_failed");
  }
  if (!meta) return fail(404, "not_found");
  // Every id must be one of this conversation's, and at least two must be
  // answers this server gave; checked before the reservation, so a refusal
  // never spends a message.
  const trusted = trustedExchanges(userId, answers);
  if (answers.length !== ids.length || trusted.length < MERGE_MIN) return fail(400, "bad_request");

  const { settings } = state;
  const studied = settings.language ? languageName(settings.language) : settings.languageOther.trim();
  if (!studied) return fail(403, "noLanguage");
  const before = allowance(state);
  if (before.reason !== "ok") return fail(403, before.reason);

  let left, reason;
  try {
    ({ left, reason } = await reserveMessage(supabase, userId, state.plan));
  } catch {
    console.error("merge: could not reserve the message");
    return fail(502, "tutor_failed");
  }
  if (reason !== "ok") return fail(403, reason, left);

  // The rule follows the Answer in switch, as a question does; native with none set falls back to the studied language.
  const native = settings.nativeLanguage ? languageName(settings.nativeLanguage) : settings.nativeLanguageOther.trim();
  const answerName = answerIn === "native" && native ? native : studied;
  const domains = REFERENCE_DOMAINS[settings.language] ?? [];
  const rules = await rulesLoad;

  let reply;
  try {
    reply = readReply(
      await askOpenRouter(
        buildRequest({
          model: tutorModel(),
          instructions: tutorInstructions({ studied, answerIn: answerName, level: settings.level, grounded: domains.length > 0, rules, merge: mergeQuestion(trusted) }),
          history: [],
          question: mergeSearch(trusted),
          domains,
        }),
        Math.max(timeLeft() - REPLY_MS, 5_000),
      ),
      rules,
      domains,
    );
  } catch (error) {
    console.error(`merge: ${error instanceof Error ? error.message : "the OpenRouter call threw"}`);
    return fail(502, "tutor_failed", left);
  }
  if (!reply) {
    console.error("merge: the reply was unreadable");
    return fail(502, "tutor_failed", left);
  }
  // The fresh citations first, then the merged answers' own, each once.
  // Answers saved before the reference-site filter may carry shop pages, so the merged list is filtered too.
  const sources = mergeSources([reply.sources, ...trusted.map((a) => a.reply.sources)]).filter((s) => onReferenceSite(s.url, domains));
  reply = { ...reply, existingRule: null, sources };

  return NextResponse.json({ reply, remaining: left });
}
