"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { HISTORY_LIMIT, QUESTION_MAX, type Plan, type TutorTurn } from "@/lib/tutor";

type Reason = "ok" | "trialUsed" | "dailyLimit";

const NOTICE = "card p-5 text-sm [overflow-wrap:anywhere]";

/**
 * Free talk with the model. The server saves each answered exchange and the
 * page hands the saved ones back on a reload, so they start this state; what
 * the model is sent is still the turns held here, the last ten before each
 * message, which is what lets a follow-up refer back.
 */
export function ConversationChat(props: { remaining: number; reason: Reason; plan: Plan; initialTurns: TutorTurn[] }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(props.remaining);
  const [reason, setReason] = useState<Reason>(props.reason);
  const [turns, setTurns] = useState<TutorTurn[]>(props.initialTurns);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const [clearFailed, setClearFailed] = useState(false);

  async function startNew() {
    setBusy(true);
    setFailed(false);
    setClearFailed(false);
    try {
      // Cleared on screen only once the saved copy is gone, or a reload would bring it back.
      const response = await fetch("/api/conversation/", { method: "DELETE" });
      if (response.ok) {
        setTurns([]);
        setUnsaved(false);
      } else if (response.status === 401) {
        router.push("/");
      } else {
        setClearFailed(true);
      }
    } catch {
      setClearFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const response = await fetch("/api/conversation/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: turns.slice(-HISTORY_LIMIT) }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && typeof body.reply === "string") {
        setTurns((all) => [...all, { role: "user", content: message }, { role: "assistant", content: body.reply }]);
        setRemaining(body.remaining);
        setUnsaved(body.saved === false);
        setText("");
      } else if (response.status === 401) {
        router.push("/");
      } else if (response.status === 403 && (body.error === "trialUsed" || body.error === "dailyLimit")) {
        setReason(body.error);
      } else {
        if (typeof body.remaining === "number") setRemaining(body.remaining);
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="notebook-page mx-auto w-full max-w-3xl flex-1 space-y-5 py-6 sm:py-8">
      <h1 className="hand-title text-2xl sm:text-3xl"><span className="marker">Conversations</span></h1>

      <ol aria-live="polite" className="space-y-3">
        {turns.map((turn, i) => (
          <li
            key={i}
            className={
              turn.role === "user"
                ? "ml-auto max-w-[85%] rounded-[3px_10px_4px_8px] border-[1.5px] border-ink bg-tile-sky px-3 py-2 text-sm whitespace-pre-wrap shadow-[2px_3px_0_var(--color-shadow)] [overflow-wrap:anywhere]"
                : "card mr-auto max-w-[85%] p-3 text-sm whitespace-pre-wrap [overflow-wrap:anywhere]"
            }
          >
            <span className="sr-only">{turn.role === "user" ? "You: " : "AI: "}</span>
            {turn.content}
          </li>
        ))}
        {busy && <li className="text-sm text-ink-soft">Thinking…</li>}
      </ol>

      {reason === "trialUsed" ? (
        <p className={NOTICE}>Conversations are part of the paid plan.</p>
      ) : reason === "dailyLimit" ? (
        <p className={NOTICE}>You have used today&apos;s messages. They reset at midnight UTC.</p>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label htmlFor="conversation-message" className="sr-only">Your message</label>
          <textarea
            id="conversation-message"
            className="field min-h-24"
            rows={3}
            maxLength={QUESTION_MAX}
            value={text}
            readOnly={busy}
            onChange={(event) => setText(event.target.value)}
            // Enter keeps its new line in a textarea, so Ctrl or Cmd with it sends, as in the tutor.
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>Send</button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => void startNew()}
            >
              New conversation
            </button>
            <p className="text-xs text-ink-soft">
              {props.plan === "paid" ? `${remaining} left today` : `${remaining} trial message${remaining === 1 ? "" : "s"} left`}
            </p>
            {failed && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                No reply came back. Try again.
              </p>
            )}
            {unsaved && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                That reply was not saved, so it will be gone after a reload.
              </p>
            )}
            {clearFailed && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                The conversation could not be cleared. Try again.
              </p>
            )}
          </div>
        </form>
      )}
    </main>
  );
}
