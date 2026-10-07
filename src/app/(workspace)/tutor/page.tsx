import type { Metadata } from "next";

import { TutorChat } from "@/components/tutor/TutorChat";
import { TutorSidebar } from "@/components/tutor/TutorSidebar";
import { shownLanguage as shown } from "@/lib/languages";
import { createSupabaseServerClient, serverUserId } from "@/lib/supabaseServer";
import {
  allowance,
  CONVERSATION_LIMIT,
  CONVERSATION_PAGE,
  EXCHANGE_LIMIT,
  readConversationId,
  type TutorExchange,
} from "@/lib/tutor";
import {
  countHeld,
  loadConversationList,
  loadConversationMeta,
  loadExchanges,
  loadLinkedRuleIds,
  loadTutorState,
  signatureValid,
} from "@/lib/tutorServer";

export const metadata: Metadata = { title: "Tutor" };

type Params = { [key: string]: string | string[] | undefined };
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * `/tutor` is a new conversation and `/tutor?c=<id>` a saved one, read here
 * under the caller's session. An id that is not a uuid, not the caller's, or
 * deleted opens a new conversation that says so, rather than an error page.
 * Every read runs at once: the exchanges and links of an id that turns out
 * not to be the caller's come back empty under row level security, and are
 * not used. `in` carries the Answer in choice across the address a new
 * conversation is given after its first answer.
 */
export default async function TutorPage({ searchParams }: { searchParams: Promise<Params> }) {
  const supabase = await createSupabaseServerClient();
  const userId = await serverUserId();
  if (!supabase || !userId) throw new Error("Supabase is not configured.");
  const params = await searchParams;
  const given = first(params.c);
  const id = readConversationId(given);
  const answerIn = first(params.in);

  const none = Promise.resolve(null);
  const [{ plan, usedTotal, usedToday, settings }, conversations, held, meta, exchanges, linkedRuleIds] = await Promise.all([
    loadTutorState(supabase),
    loadConversationList(supabase),
    countHeld(supabase),
    id ? loadConversationMeta(supabase, id) : none,
    id ? loadExchanges(supabase, id, CONVERSATION_PAGE) : Promise.resolve([]),
    id ? loadLinkedRuleIds(supabase, id) : Promise.resolve([]),
  ]);

  const allowed = allowance({ plan, usedTotal, usedToday });
  // Full is checked after the allowance, so a used-up trial still says so.
  const full = held.exchanges >= EXCHANGE_LIMIT || (!meta && held.conversations >= CONVERSATION_LIMIT);
  const reason = allowed.reason === "ok" && full ? "storageFull" : allowed.reason;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-x-8 px-4 lg:flex-row">
      <TutorSidebar conversations={conversations} activeId={meta?.id ?? null} />
      <TutorChat
        // A new key per conversation, so moving between them starts each from its own saved state.
        key={meta?.id ?? "new"}
        remaining={allowed.remaining}
        reason={reason}
        plan={plan}
        studiedName={shown(settings.language, settings.languageOther)}
        nativeName={shown(settings.nativeLanguage, settings.nativeLanguageOther)}
        initialAnswerIn={answerIn === "native" || answerIn === "studied" ? answerIn : null}
        conversationId={meta?.id ?? null}
        // The text and signature stay on the server; the page is told only
        // whether each answer can go back to the model in a merge.
        initialExchanges={
          meta
            ? exchanges.map(({ id, kind, question, reply, answerText, signature }): TutorExchange => ({
                id,
                kind,
                question,
                reply,
                mergeable: signatureValid(userId, answerText, signature),
              }))
            : []
        }
        linkedRuleIds={meta ? linkedRuleIds : []}
        notFound={given !== undefined && !meta}
      />
    </div>
  );
}
