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
import { shownLanguage } from "@/lib/languages";
import {
  allowance,
  buildRequest,
  MERGE_MIN,
  mergeQuestion,
  mergeSearch,
  readConversationId,
  readExchangeIds,
  REFERENCE_DOMAINS,
  tutorInstructions,
} from "@/lib/tutor";
import { ask, fail, openRequest, reserve, unconfigured } from "@/lib/tutorRoute";
import {
  loadConversationMeta,
  loadExchangesById,
  loadRuleTitles,
  loadTutorState,
  trustedExchanges,
  tutorModel,
} from "@/lib/tutorServer";

export const runtime = "nodejs";
export const maxDuration = 60;

const BUDGET_MS = 55_000;
/** Kept back from the model to send the reply. */
const REPLY_MS = 2_000;

export async function POST(request: Request) {
  const started = Date.now();
  const timeLeft = () => BUDGET_MS - (Date.now() - started);

  const opened = await openRequest<{ conversationId?: unknown; exchangeIds?: unknown; answerIn?: unknown }>(request);
  if (opened instanceof Response) return opened;
  const { userId, supabase, body } = opened;
  const conversationId = readConversationId(body?.conversationId);
  const ids = readExchangeIds(body?.exchangeIds);
  if (!conversationId || !ids) return fail(400, "bad_request");
  const answerIn = body.answerIn === "native" ? "native" : "studied";

  const missing = unconfigured("merge");
  if (missing) return missing;

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
  const studied = shownLanguage(settings.language, settings.languageOther);
  if (!studied) return fail(403, "noLanguage");
  const before = allowance(state);
  if (before.reason !== "ok") return fail(403, before.reason);

  const left = await reserve(supabase, userId, state.plan, "merge: could not reserve the message");
  if (left instanceof Response) return left;

  // The rule follows the Answer in switch, as a question does; native with none set falls back to the studied language.
  const native = shownLanguage(settings.nativeLanguage, settings.nativeLanguageOther);
  const answerName = answerIn === "native" && native ? native : studied;
  const domains = REFERENCE_DOMAINS[settings.language] ?? [];
  const rules = await rulesLoad;

  const answer = await ask(
    "merge",
    left,
    buildRequest({
      model: tutorModel(),
      instructions: tutorInstructions({ studied, answerIn: answerName, level: settings.level, grounded: domains.length > 0, rules, merge: mergeQuestion(trusted) }),
      history: [],
      question: mergeSearch(trusted),
      domains,
    }),
    Math.max(timeLeft() - REPLY_MS, 5_000),
    rules,
    domains,
  );
  if (answer instanceof Response) return answer;
  // Only the merge's own citations, from its search on the rule's topics. The
  // ticked answers' sources are not carried over: a follow-up's search was on
  // its own words, and a merged rule listed pages for "erklären" that way
  // (7 October 2026).
  const reply = { ...answer, existingRule: null };

  return NextResponse.json({ reply, remaining: left });
}
