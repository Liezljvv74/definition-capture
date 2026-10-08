"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AnswerCard } from "@/components/tutor/AnswerCard";
import { SaveAsRuleDialog } from "@/components/tutor/SaveAsRuleDialog";
import { MERGE_MAX, mergeLabel, QUESTION_MAX, type Plan, type TutorExchange, type TutorReply } from "@/lib/tutor";
import { recordSavedRule } from "@/lib/tutorConversations";
import { useRules } from "@/lib/useRules";

type Reason = "ok" | "trialUsed" | "dailyLimit" | "storageFull";

const NOTICE = "card p-5 text-sm [overflow-wrap:anywhere]";
const ERROR = "text-sm text-red-600 dark:text-red-400";

/**
 * The address a conversation gets once its first answer is saved, or null when
 * the page was opened on a saved conversation already. It goes by the address
 * the page was opened with, not the state's copy of the id: a first answer
 * that failed to save still sets the state, and the next, saved, answer must
 * then give the address all the same, or a reload would lose the chat.
 */
export function newAddress(openedWith: string | null, id: string | undefined, answerIn: string): string | null {
  return !openedWith && id ? `/tutor?c=${id}&in=${answerIn}` : null;
}

export function TutorChat(props: {
  remaining: number;
  reason: Reason;
  plan: Plan;
  studiedName: string | null;
  nativeName: string | null;
  initialAnswerIn: "native" | "studied" | null;
  conversationId: string | null;
  initialExchanges: TutorExchange[];
  linkedRuleIds: string[];
  /** Answer id to the rule it was saved as. */
  savedRules: Record<number, string>;
  notFound: boolean;
}) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(props.remaining);
  const [reason, setReason] = useState<Reason>(props.reason);
  const [studiedName, setStudiedName] = useState(props.studiedName);
  const [answerIn, setAnswerIn] = useState<"native" | "studied">(
    props.initialAnswerIn ?? (props.nativeName ? "native" : "studied"),
  );
  // Kept here as well as in the address: a conversation made for a first
  // answer that then failed to save is reused by the next question.
  const [conversationId, setConversationId] = useState(props.conversationId);
  const [exchanges, setExchanges] = useState<TutorExchange[]>(props.initialExchanges);
  const [ticked, setTicked] = useState<number[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  // The reply being saved, and the answer it is (null for a merged draft).
  const [saving, setSaving] = useState<{ reply: TutorReply; exchangeId: number | null } | null>(null);
  const [savedRules, setSavedRules] = useState(props.savedRules);
  // A merged rule waiting to be saved or discarded. It lives only here, never
  // in the conversation (the owner's decision, 7 October 2026), so leaving or
  // reloading the page throws it away, and once saved it goes, so it cannot be
  // saved twice.
  const [draft, setDraft] = useState<{ reply: TutorReply; count: number } | null>(null);
  const [linkedRuleIds, setLinkedRuleIds] = useState(props.linkedRuleIds);
  // Loads the rules, so an answer that points to a saved one can link to it.
  useRules();

  /**
   * Sends a question or a merge and handles the failures they share. `take`
   * reads a successful reply and says whether it was the shape expected.
   */
  async function send(url: string, payload: object, take: (body: Record<string, unknown>) => boolean): Promise<boolean> {
    setBusy(true);
    setFailed(false);
    setUnsaved(false);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown> & { remaining?: unknown; error?: string };
      if (response.ok && take(body)) {
        if (typeof body.remaining === "number") setRemaining(body.remaining);
        return true;
      }
      if (response.status === 401) router.push("/");
      else if (response.status === 403 && body.error === "noLanguage") setStudiedName(null);
      else if (response.status === 403 && (body.error === "trialUsed" || body.error === "dailyLimit" || body.error === "storageFull")) setReason(body.error);
      else {
        // A failure after the reservation says what is left; any other leaves the count as it was.
        if (typeof body.remaining === "number") setRemaining(body.remaining);
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
    return false;
  }

  async function ask() {
    const question = text.trim();
    if (!question || busy) return;
    const sent = await send("/api/tutor/", { question, answerIn, conversationId }, (body) => {
      if (!body.exchange) return false;
      setExchanges((all) => [...all, body.exchange as TutorExchange]);
      setUnsaved(!body.saved);
      const id = typeof body.conversationId === "string" ? body.conversationId : undefined;
      setConversationId(id ?? conversationId);
      // Only a saved answer touches the address or the server's copy. A new
      // conversation gets its address once its first answer is saved,
      // carrying the answer language across; a later one refreshes the
      // sidebar's order. An unsaved answer leaves both alone: a refresh
      // would replace the chat with what the server has, which lacks it
      // (and, if another tab deleted the conversation, everything).
      const address = body.saved ? newAddress(props.conversationId, id, answerIn) : null;
      if (address) router.replace(address);
      else if (body.saved) router.refresh();
      return true;
    });
    if (sent) setText("");
  }

  async function merge() {
    if (busy || ticked.length < 2) return;
    // The ticked answers stay ticked when the merge fails, so it can be tried again.
    const count = ticked.length;
    const sent = await send("/api/tutor/merge/", { conversationId, exchangeIds: ticked, answerIn }, (body) => {
      if (!body.reply) return false;
      setDraft({ reply: body.reply as TutorReply, count });
      return true;
    });
    if (sent) setTicked([]);
  }

  const languages = [
    ...(props.nativeName ? [{ value: "native" as const, name: props.nativeName }] : []),
    ...(studiedName ? [{ value: "studied" as const, name: studiedName }] : []),
  ];

  return (
    <main className="notebook-page mx-auto w-full max-w-3xl min-w-0 flex-1 space-y-5 py-6 sm:py-8">
      <h1 className="hand-title text-2xl sm:text-3xl"><span className="marker">Tutor</span></h1>

      {props.notFound && <p className={NOTICE}>That conversation was not found.</p>}

      {studiedName && (
        // The legend is visible: a lone radio button reading "German" said
        // nothing about what it chose. Without a native language there is
        // only one answer language, so the link says where to add the other.
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <legend className="float-left mr-3 text-sm font-medium">Answer in</legend>
          {languages.map((language) => (
            <label key={language.value} className="flex items-center gap-1.5 text-sm [overflow-wrap:anywhere]">
              <input
                type="radio"
                name="answer-language"
                checked={answerIn === language.value}
                onChange={() => setAnswerIn(language.value)}
              />
              {language.name}
            </label>
          ))}
          {!props.nativeName && (
            <Link href="/settings" className="text-sm text-link underline underline-offset-2">
              Add your native language
            </Link>
          )}
        </fieldset>
      )}

      <div aria-live="polite" className="space-y-4">
        {exchanges.map((exchange, i) => (
          <AnswerCard
            key={exchange.id ?? `unsaved-${i}`}
            exchange={exchange}
            index={i}
            ticked={!exchange.mergeable || exchange.id === null || exchange.reply.existingRule ? null : ticked.includes(exchange.id)}
            // The merge route refuses more than MERGE_MAX, so the rest wait until one is unticked.
            tickDisabled={ticked.length >= MERGE_MAX && !ticked.includes(exchange.id!)}
            onTick={(on) =>
              setTicked((all) => (on ? [...all, exchange.id!] : all.filter((id) => id !== exchange.id)))
            }
            onSave={() => setSaving({ reply: exchange.reply, exchangeId: exchange.id })}
            savedRuleId={exchange.id === null ? undefined : savedRules[exchange.id]}
          />
        ))}
        {draft && (
          <AnswerCard
            exchange={{ id: null, kind: "merge", question: mergeLabel(draft.count), reply: draft.reply, mergeable: false }}
            index={exchanges.length}
            ticked={null}
            onTick={() => {}}
            onSave={() => setSaving({ reply: draft.reply, exchangeId: null })}
            onDiscard={() => setDraft(null)}
          />
        )}
        {busy && <p className="text-sm text-ink-soft">Thinking… <span aria-hidden="true" className="hourglass">⏳</span></p>}
        {unsaved && <p role="alert" className={ERROR}>This answer was not saved.</p>}
      </div>

      {ticked.length >= 2 && reason === "ok" && studiedName && (
        <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-2 rounded-md border-[1.5px] border-ink bg-paper p-2 shadow-[2px_3px_0_var(--color-shadow)]">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void merge()}>
            Make one rule from {ticked.length} answers
          </button>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setTicked([])}>
            Clear
          </button>
        </div>
      )}

      {!studiedName ? (
        <p className={NOTICE}>
          <Link href="/settings" className="underline">Choose the language you are studying</Link>
        </p>
      ) : reason === "storageFull" ? (
        <p className={NOTICE}>You have reached the most conversations and answers an account can keep. Delete a conversation to ask more.</p>
      ) : reason === "trialUsed" ? (
        <p className={NOTICE}>The tutor is part of the paid plan.</p>
      ) : reason === "dailyLimit" ? (
        <p className={NOTICE}>You have used today&apos;s questions. They reset at midnight UTC.</p>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void ask();
          }}
        >
          <label htmlFor="tutor-question" className="sr-only">Your question</label>
          <textarea
            id="tutor-question"
            className="field min-h-24"
            rows={3}
            maxLength={QUESTION_MAX}
            value={text}
            readOnly={busy}
            onChange={(event) => setText(event.target.value)}
            // Enter keeps its new line in a textarea, so Ctrl or Cmd with it sends.
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void ask();
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>Ask</button>
            <p className="text-xs text-ink-soft">
              {props.plan === "paid" ? `${remaining} left today` : `${remaining} trial message${remaining === 1 ? "" : "s"} left`}
            </p>
            {failed && (
              <p role="alert" className={ERROR}>
                The tutor could not answer. Try again.
              </p>
            )}
          </div>
        </form>
      )}

      {saving && (
        <SaveAsRuleDialog
          reply={saving.reply}
          linkedRuleIds={linkedRuleIds}
          onSaved={(rule) => {
            setLinkedRuleIds((all) => [...all, rule.id]);
            // A saved draft has done its job; it goes, so it cannot be saved again.
            if (draft && saving.reply === draft.reply) setDraft(null);
            // A saved answer offers its rule from now on instead of a second save.
            const from = saving.exchangeId;
            if (from !== null) setSavedRules((all) => ({ ...all, [from]: rule.id }));
            // Recorded only for a saved conversation; an answer that was not
            // saved has nowhere to record it.
            if (conversationId) void recordSavedRule(conversationId, rule.id, saving.exchangeId);
          }}
          onClose={() => setSaving(null)}
        />
      )}
    </main>
  );
}
