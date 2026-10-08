/**
 * POST /api/tutor: asks the grammar tutor one question, in a saved
 * conversation (Docs/tutor-conversations.md).
 *
 * The key and the signing secret are read in `tutorServer.ts` alone, and
 * never logged or sent back. Nothing in the request is trusted for the plan,
 * the user, the limits or the history: the session says who is asking, the
 * database what they have used and what was said before. Earlier answers
 * reach the model only when the server's signature on them verifies, since
 * the account can write rows of its own with the publishable key. Logs carry
 * status codes and short reasons only, never the learner's text or the reply.
 *
 * Time: Vercel stops the function at 60 seconds and no catch block runs then,
 * which would lose an answer already paid for. So the route keeps to 55: the
 * reads, the rule titles and the memory search run at once, embeddings get 5
 * seconds each, the model gets what is left less time to save, and the
 * answer is embedded only if there is time; without a vector it is still
 * found by keyword.
 */

import { NextResponse } from "next/server";
import { shownLanguage } from "@/lib/languages";
import {
  allowance,
  answerText,
  asQuery,
  buildRequest,
  conversationName,
  EMBED_TEXT_MAX,
  exchangeTurns,
  followUp,
  HISTORY_LIMIT,
  MEMORY_LIMIT,
  pickMemory,
  QUESTION_MAX,
  readConversationId,
  REFERENCE_DOMAINS,
  storageFull,
  tutorInstructions,
  type SearchRow,
  type StoredExchange,
  type TutorExchange,
} from "@/lib/tutor";
import { ask, fail, openRequest, reserve, unconfigured } from "@/lib/tutorRoute";
import {
  countHeld,
  createConversation,
  embedOrNull,
  loadConversationMeta,
  loadExchanges,
  loadRuleTitles,
  loadTutorState,
  saveTutorExchange,
  searchExchanges,
  trustedExchanges,
  tutorModel,
} from "@/lib/tutorServer";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The route's own limit, under Vercel's 60 seconds. */
const BUDGET_MS = 55_000;
/** Kept back from the model for embedding and saving the answer. */
const SAVE_MS = 6_000;
/** The least time worth giving the answer's embedding. */
const EMBED_MIN_MS = 3_000;

export async function POST(request: Request) {
  const started = Date.now();
  const timeLeft = () => BUDGET_MS - (Date.now() - started);

  const opened = await openRequest<{ question?: unknown; conversationId?: unknown; answerIn?: unknown }>(request);
  if (opened instanceof Response) return opened;
  const { userId, supabase, body } = opened;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (question.length < 1 || question.length > QUESTION_MAX) return fail(400, "bad_request");
  const given = body.conversationId ?? null;
  const conversationId = given === null ? null : readConversationId(given);
  if (given !== null && !conversationId) return fail(400, "bad_request");
  const answerIn = body.answerIn === "native" ? "native" : "studied";

  const missing = unconfigured("tutor");
  if (missing) return missing;

  // Started now and awaited after the reservation, so they run beside the
  // reads. Neither is needed for an answer: without rule titles the tutor
  // cannot point to a saved rule, and without memory it remembers only the
  // open conversation. Memory is searched before the message is spent, but
  // search is free and a refused question rarely gets this far.
  const rulesLoad = loadRuleTitles(supabase).catch(() => {
    console.error("tutor: could not read the rule titles");
    return [] as string[];
  });
  const memorySearch = embedOrNull(asQuery(question))
    .then((vector) => searchExchanges(supabase, question, vector, MEMORY_LIMIT + HISTORY_LIMIT))
    .catch(() => {
      console.error("tutor: the memory search failed");
      return [] as SearchRow[];
    });

  let meta, state, recent: StoredExchange[], held;
  try {
    [meta, state, recent, held] = await Promise.all([
      conversationId ? loadConversationMeta(supabase, conversationId) : Promise.resolve(null),
      loadTutorState(supabase),
      // For a conversation that is not the caller's this is empty under row
      // level security, and the 404 below is sent before it is used.
      conversationId ? loadExchanges(supabase, conversationId, HISTORY_LIMIT) : Promise.resolve([]),
      countHeld(supabase),
    ]);
  } catch {
    console.error("tutor: could not read the account's state or conversation");
    return fail(502, "tutor_failed");
  }
  if (conversationId && !meta) return fail(404, "not_found");

  const { settings } = state;
  const studied = shownLanguage(settings.language, settings.languageOther);
  // Every refusal comes before the reservation, so a refusal never spends a message.
  if (!studied) return fail(403, "noLanguage");
  const before = allowance(state);
  if (before.reason !== "ok") return fail(403, before.reason);
  // An answer that could not be saved would still cost a message, so a full account is refused first.
  if (storageFull(held, Boolean(conversationId))) return fail(403, "storageFull");

  const left = await reserve(supabase, userId, state.plan, "tutor: could not reserve the question");
  if (left instanceof Response) return left;

  const native = shownLanguage(settings.nativeLanguage, settings.nativeLanguageOther);
  const answerName = answerIn === "native" && native ? native : studied;
  // A typed language has no code, so no reference sites and no search.
  const domains = REFERENCE_DOMAINS[settings.language] ?? [];

  const [rules, found] = await Promise.all([rulesLoad, memorySearch]);
  // Signed ones only, none already in the history, oldest first so they read in order.
  const memory = pickMemory(trustedExchanges(userId, found), new Set(recent.map((e) => e.id))).sort((a, b) => a.id - b.id);
  const history = trustedExchanges(userId, recent);

  const reply = await ask(
    "tutor",
    left,
    buildRequest({
      model: tutorModel(),
      instructions: tutorInstructions({ studied, answerIn: answerName, level: settings.level, grounded: domains.length > 0, rules }),
      history: [...exchangeTurns(memory), ...exchangeTurns(history)],
      question: followUp(question, history.at(-1)?.reply.title),
      domains,
    }),
    Math.max(timeLeft() - SAVE_MS, 5_000),
    rules,
    domains,
  );
  if (reply instanceof Response) return reply;

  // A reply that could not be saved is still returned: it was paid for, and
  // the page says it will not survive a reload. A conversation made for a
  // first question whose exchange then failed is kept, and the next question
  // goes into it. The conversation is made while the answer is embedded.
  let id = conversationId;
  let exchange: TutorExchange = { id: null, kind: "answer", question, reply, mergeable: false };
  let saved = false;
  try {
    const time = timeLeft() - EMBED_MIN_MS;
    const [made, embedding] = await Promise.all([
      id ? Promise.resolve(id) : createConversation(supabase, userId, conversationName(reply, question)),
      time >= EMBED_MIN_MS ? embedOrNull(`${question}\n${answerText(reply)}`.slice(0, EMBED_TEXT_MAX), Math.min(5_000, time)) : null,
    ]);
    id = made;
    exchange = await saveTutorExchange(supabase, { userId, conversationId: id, kind: "answer", question, reply, embedding });
    saved = true;
  } catch {
    console.error("tutor: could not save the exchange");
  }

  // ponytail: two requests racing can both be refused; the limit is never
  // exceeded. Failed answers count, by the owner's decision (2 October 2026).
  // Midnight UTC edge: a question reserved just before midnight and re-counted
  // just after can give a paid account one extra question that day. The
  // storage limit can be passed by one or two when questions race; the
  // database refuses the rest.
  return NextResponse.json({ conversationId: id, exchange, remaining: left, saved });
}
