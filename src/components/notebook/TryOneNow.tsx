"use client";

import { useId, useRef, useState, type FormEvent } from "react";

import { celebrate, reducedMotion } from "@/components/notebook/doodles";

/*
 * The mock-up's sample cards, word for word: a word, the meanings that count
 * as right, and the hint shown before an answer. Added to the landing page
 * at the owner's request on 3 October 2026. Nothing here is saved anywhere.
 */
const CARDS: { word: string; answers: string[]; hint: string }[] = [
  { word: "la mariposa", answers: ["butterfly"], hint: "Hint: it flutters." },
  { word: "tener hambre", answers: ["to be hungry", "be hungry", "hungry"], hint: "Hint: lunchtime." },
  {
    word: "Wie geht’s?",
    answers: ["how are you", "how are you?", "how is it going", "how’s it going"],
    hint: "Hint: a greeting.",
  },
];

/** Lower case, and the end punctuation a learner may or may not type. */
const normalise = (value: string) => value.trim().toLowerCase().replace(/[.!?]/g, "");

/**
 * A flashcard to try on the landing page, after the mock-up: type the meaning
 * and press Check. Right draws a check mark, star, heart and sparkles round
 * the card; wrong makes it wobble and offers a hint, never a doodle. The
 * message is announced to screen readers.
 */
export function TryOneNow() {
  const inputId = useId();
  const card = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const [answer, setAnswer] = useState("");
  const [wrong, setWrong] = useState(0);
  const [message, setMessage] = useState<{ text: string; tone: "hint" | "good" | "bad" }>({
    text: CARDS[0].hint,
    tone: "hint",
  });

  function check(event: FormEvent) {
    event.preventDefault();
    const given = normalise(answer);
    if (!given) return;
    const current = CARDS[at];
    if (current.answers.some((right) => normalise(right) === given)) {
      setMessage({ text: "Correct! Back for review in a few days.", tone: "good" });
      setWrong(0);
      if (card.current && !reducedMotion()) celebrate(card.current);
      window.setTimeout(() => {
        const next = (at + 1) % CARDS.length;
        setAt(next);
        setAnswer("");
        setMessage({ text: CARDS[next].hint, tone: "hint" });
      }, 2200);
    } else {
      const misses = wrong + 1;
      setWrong(misses);
      setMessage({
        text: misses > 1 ? `Not yet. It starts with "${current.answers[0].charAt(0)}".` : "Not quite. Have another go.",
        tone: "bad",
      });
      // Restarted in place, so the answer box keeps its focus and text; under
      // reduced motion notebook.css switches the animation off.
      const el = card.current;
      if (el) {
        el.classList.remove("wobble");
        void el.offsetWidth;
        el.classList.add("wobble");
      }
    }
  }

  const tone = message.tone === "good" ? "text-[#1c6b3d] dark:text-[#8fd8ac]" : message.tone === "bad" ? "text-[#a23a3a] dark:text-[#f2a5a5]" : "";

  return (
    <div
      ref={card}
      className="relative mt-4 rotate-[1.2deg] rounded-[4px] border-2 border-ink bg-card px-4 pt-3 pb-3.5 shadow-[2px_3px_0_var(--color-shadow)]"
    >
      <div className="text-[0.8rem] leading-5 tracking-[0.12em] text-ink-soft uppercase">Try one now</div>
      <div className="hand-title my-0.5 text-[1.6rem] leading-[38px]">{CARDS[at].word}</div>
      <form className="flex flex-wrap gap-2.5" autoComplete="off" onSubmit={check}>
        <label htmlFor={inputId} className="sr-only">
          Type the meaning
        </label>
        <input
          id={inputId}
          type="text"
          className="ink-input flex-[1_1_140px] text-[1.05rem]"
          placeholder="type the meaning…"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
        />
        <button
          type="submit"
          className="cursor-pointer rounded-[12px_4px_12px_4px] border-2 border-ink bg-marker px-4 py-2 text-base text-[#1d2742] dark:text-ink"
        >
          Check
        </button>
      </form>
      <p aria-live="polite" className={`mt-1.5 min-h-7 text-[1.02rem] leading-7 ${tone}`}>
        {message.text}
      </p>
    </div>
  );
}
