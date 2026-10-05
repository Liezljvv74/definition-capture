"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties } from "react";

import { BlockView } from "@/components/grammar/BlockView";
import { SaveAsRuleDialog } from "@/components/tutor/SaveAsRuleDialog";
import { plainText } from "@/lib/blockText";
import { findByTitle } from "@/lib/rules";
import { HISTORY_LIMIT, QUESTION_MAX, type Plan, type TutorReply, type TutorTurn } from "@/lib/tutor";
import type { Block } from "@/lib/types";
import { useRules } from "@/lib/useRules";

type Reason = "ok" | "trialUsed" | "dailyLimit";
type Exchange = { question: string; reply: TutorReply };

/** An answer as the plain text a follow-up is given for context, so the JSON is not sent back. */
function answerText(reply: TutorReply): string {
  const body = (block: Block) =>
    block.kind === "text" ? plainText(block.text)
    : block.kind === "table" ? block.cells.map((row) => row.map(plainText).join(" | ")).join("\n")
    : `${plainText(block.sentence)} (${plainText(block.translation)})`;
  // Named, so a follow-up is answered in full rather than pointed to the rule again.
  const pointed = reply.existingRule ? [`(Pointed the learner to their saved rule "${reply.existingRule}".)`] : [];
  return [reply.title, ...reply.blocks.map(body), ...pointed].join("\n");
}

/** The source's title, or its host when it has none. */
function sourceLabel(source: { url: string; title: string }): string {
  if (source.title.trim()) return source.title;
  try {
    return new URL(source.url).hostname;
  } catch {
    return source.url;
  }
}

const NOTICE = "card p-5 text-sm [overflow-wrap:anywhere]";

/** A link to the saved rule an answer points to; nothing while the rules load or if it has since gone. */
function SavedRuleLink({ title }: { title: string }) {
  const rule = findByTitle(title);
  if (!rule) return null;
  return (
    <Link href={`/rule/?id=${rule.id}`} className="btn btn-secondary">
      Open “{rule.title}”
    </Link>
  );
}

export function TutorChat(props: {
  remaining: number;
  reason: Reason;
  plan: Plan;
  studiedName: string | null;
  nativeName: string | null;
}) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(props.remaining);
  const [reason, setReason] = useState<Reason>(props.reason);
  const [studiedName, setStudiedName] = useState(props.studiedName);
  const [answerIn, setAnswerIn] = useState<"native" | "studied">(props.nativeName ? "native" : "studied");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState<TutorReply | null>(null);
  // Titles of the rules saved from this conversation, in order, so the next
  // one saved can link to them.
  const [savedTitles, setSavedTitles] = useState<string[]>([]);
  // Loads the rules, so an answer that points to a saved one can link to it.
  useRules();

  async function ask() {
    const question = text.trim();
    if (!question || busy) return;
    const history: TutorTurn[] = exchanges
      .flatMap((e): TutorTurn[] => [
        { role: "user", content: e.question },
        { role: "assistant", content: answerText(e.reply) },
      ])
      .slice(-HISTORY_LIMIT);
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/tutor/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history, answerIn }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.reply) {
        setExchanges((all) => [...all, { question, reply: body.reply }]);
        setRemaining(body.remaining);
        setText("");
      } else if (response.status === 401) {
        router.push("/");
      } else if (response.status === 403 && body.error === "noLanguage") {
        setStudiedName(null);
      } else if (response.status === 403 && (body.error === "trialUsed" || body.error === "dailyLimit")) {
        setReason(body.error);
      } else {
        // A failure after the reservation says what is left; any other leaves the count as it was.
        if (typeof body.remaining === "number") setRemaining(body.remaining);
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const languages = [
    ...(props.nativeName ? [{ value: "native" as const, name: props.nativeName }] : []),
    ...(studiedName ? [{ value: "studied" as const, name: studiedName }] : []),
  ];

  return (
    <main className="notebook-page mx-auto w-full max-w-3xl flex-1 space-y-5 py-6 sm:py-8">
      <h1 className="hand-title text-2xl sm:text-3xl"><span className="marker">Tutor</span></h1>

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
        {exchanges.map(({ question, reply }, i) => (
          <section key={i} className="space-y-2">
            <p
              className="paste ml-auto max-w-[85%] rounded-[3px_10px_4px_8px] border-[1.5px] border-ink bg-tile-sky px-3 py-2 text-sm whitespace-pre-wrap shadow-[2px_3px_0_var(--color-shadow)] [overflow-wrap:anywhere]"
              style={{ "--r": `${i % 2 ? -0.8 : 0.8}deg` } as CSSProperties}
            >
              {question}
            </p>
            <div className="card space-y-3 p-4 [overflow-wrap:anywhere]">
              <h2 className="hand-title text-lg">{reply.title}</h2>
              {reply.blocks.map((block) => (
                <BlockView key={block.id} block={block} linkIndex={new Map()} />
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t-[1.5px] border-dashed border-rule pt-2 text-xs">
                {reply.sources.length > 0 ? (
                  <ul className="flex min-w-0 flex-wrap gap-x-3 gap-y-1">
                    {reply.sources.map((source) => (
                      <li key={source.url} className="min-w-0">
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block max-w-[16rem] truncate underline"
                        >
                          {sourceLabel(source)}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-ink-soft">Not checked against a reference</p>
                )}
                {reply.existingRule ? (
                  // The rule is already saved, so the answer offers it rather than a second copy.
                  <SavedRuleLink title={reply.existingRule} />
                ) : (
                  <button type="button" className="btn btn-secondary" onClick={() => setSaving(reply)}>
                    Save as rule
                  </button>
                )}
              </div>
            </div>
          </section>
        ))}
        {busy && <p className="text-sm text-ink-soft">Thinking… <span aria-hidden="true" className="hourglass">⏳</span></p>}
      </div>

      {!studiedName ? (
        <p className={NOTICE}>
          <Link href="/settings" className="underline">Choose the language you are studying</Link>
        </p>
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
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => {
                setExchanges([]);
                setSavedTitles([]);
                setFailed(false);
              }}
            >
              New conversation
            </button>
            <p className="text-xs text-ink-soft">
              {props.plan === "paid" ? `${remaining} left today` : `${remaining} trial message${remaining === 1 ? "" : "s"} left`}
            </p>
            {failed && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                The tutor could not answer. Try again.
              </p>
            )}
          </div>
        </form>
      )}

      {saving && (
        <SaveAsRuleDialog
          reply={saving}
          linkTo={savedTitles}
          onSaved={(title) => setSavedTitles((all) => [...all, title])}
          onClose={() => setSaving(null)}
        />
      )}
    </main>
  );
}
