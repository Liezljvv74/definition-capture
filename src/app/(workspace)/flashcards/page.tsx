"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import {
  answerCard,
  FlashcardError,
  loadDeck,
  setNeedsReview,
  type Card,
  type Outcome,
} from "@/lib/flashcards";

export default function FlashcardsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Deck />
    </Suspense>
  );
}

function Deck() {
  const deckId = useSearchParams().get("deck");

  const [cards, setCards] = useState<Card[] | null>(null);
  const [at, setAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState({ correct: 0, wrong: 0 });

  useEffect(() => {
    if (!deckId) return;
    let current = true;
    void loadDeck(deckId)
      .then((found) => {
        if (current) setCards(found);
      })
      .catch((cause: unknown) => {
        if (!current) return;
        setCards([]);
        setError(
          cause instanceof FlashcardError ? cause.message : "That deck could not be read.",
        );
      });
    return () => {
      current = false;
    };
  }, [deckId]);

  if (!deckId) return <Message title="No deck" body="Start one from the home page." />;
  if (cards === null) return <Loading />;
  if (error && cards.length === 0) {
    return <Message title="That deck could not be read" body={error} />;
  }
  if (cards.length === 0) {
    return (
      <Message
        title="Nothing to review"
        body="Nothing matched those filters. Try widening them, or give a definition to a word that does not have one yet."
      />
    );
  }

  const card = cards[at];
  if (!card) return <Finished total={cards.length} correct={done.correct} wrong={done.wrong} />;

  return (
    <>
      <header className="bg-challenge">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" className="text-sm font-medium text-indigo-900 hover:underline">
            ← Leave the challenge
          </Link>
          <p className="text-sm font-medium text-slate-700">
            Card {at + 1} of {cards.length}
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        {error && (
          <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        {/*
         * Keyed on the card, which is what resets it.
         *
         * The phase and the moment the card appeared are this component's own
         * state, and moving to the next card has to clear both. Syncing them
         * from the parent in an effect would set state during an effect and
         * cascade a second render of a card that was already correct; a key
         * remounts it with the right state to begin with, which is what React
         * suggests instead of that effect.
         */}
        <CardFace
          key={card.id}
          card={card}
          deckId={deckId}
          onProblem={setError}
          onFinished={(outcome) => {
            setDone((count) =>
              outcome === "correct"
                ? { ...count, correct: count.correct + 1 }
                : { ...count, wrong: count.wrong + 1 },
            );
            setAt((index) => index + 1);
          }}
        />
      </main>
    </>
  );
}

/** What the card is doing: waiting, turned over, or flashing an answer back. */
type Phase = "asking" | "correct" | "wrong" | "revealed";

function CardFace({
  card,
  deckId,
  onFinished,
  onProblem,
}: {
  card: Card;
  deckId: string;
  /** Called once this card is done with, with what it counted as. */
  onFinished: (outcome: "correct" | "wrong") => void;
  onProblem: (message: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("asking");
  const [marked, setMarked] = useState(false);

  /**
   * When this card appeared, so the answer can be timed. A ref, and written
   * from an effect rather than from an initialiser: reading a clock during
   * render is the impurity that makes a render produce a different result
   * each time it happens. Writing a ref in an effect sets no state, so it
   * cascades nothing.
   */
  const shownAt = useRef(0);
  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  async function record(outcome: Outcome) {
    try {
      await answerCard(card.id, outcome, deckId, Date.now() - shownAt.current);
    } catch (cause) {
      onProblem(
        cause instanceof FlashcardError ? cause.message : "That answer could not be recorded.",
      );
    }
  }

  /**
   * Correct flashes green and moves on by itself. The pause is what makes the
   * flash a flash: answering and advancing in the same instant means the
   * colour is never seen, and a colour nobody sees is not feedback.
   */
  function knewIt() {
    if (phase !== "asking") return;
    setPhase("correct");
    void record("correct");
    window.setTimeout(() => onFinished("correct"), 650);
  }

  /** Wrong flashes orange and waits, because there are three things to do next. */
  function didNot() {
    if (phase !== "asking") return;
    setPhase("wrong");
  }

  function tryAgain() {
    // Not recorded: nothing has been decided yet, and logging an attempt that
    // is about to be replaced would count one card as two reviews.
    setPhase("asking");
    shownAt.current = Date.now();
  }

  function seeTheAnswer() {
    setPhase("revealed");
    void record("revealed");
  }

  function carryOn() {
    // A card moved past without being revealed is "again": the reader said
    // they did not know it and chose not to look.
    if (phase === "wrong") void record("again");
    onFinished("wrong");
  }

  async function toggleMark() {
    const next = !marked;
    setMarked(next);
    try {
      await setNeedsReview(card.id, next);
    } catch {
      // Put the tick back where it was rather than claiming a mark that did
      // not land.
      setMarked(!next);
    }
  }

  const face =
    phase === "correct"
      ? "bg-flash-correct"
      : phase === "wrong" || phase === "revealed"
        ? "bg-flash-wrong"
        : "bg-flashcard";

  return (
    <>
      <div className={`rounded-2xl p-8 shadow-sm transition-colors duration-200 sm:p-12 ${face}`}>
        <p className="text-xs font-medium tracking-[0.14em] text-slate-600 uppercase">
          {label(card.itemType)}
        </p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900 sm:text-3xl">
          {card.front}
        </h1>

        {/* `aria-live`, because turning a card over changes the page without
            moving focus, and a screen reader would otherwise not be told. */}
        <div aria-live="polite" className="min-h-24">
          {phase === "revealed" || phase === "correct" ? (
            <p className="mt-6 text-lg whitespace-pre-line text-slate-800">{card.back}</p>
          ) : (
            <p className="mt-6 text-sm text-slate-600">
              {phase === "wrong"
                ? "Not quite. Try it again, see the answer, or move on."
                : "Do you know it?"}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {phase === "asking" && (
          <>
            <button type="button" className="btn btn-primary" onClick={knewIt}>
              I knew it
            </button>
            <button type="button" className="btn btn-secondary" onClick={didNot}>
              I did not
            </button>
          </>
        )}

        {phase === "wrong" && (
          <>
            <button type="button" className="btn btn-secondary" onClick={tryAgain}>
              Try again
            </button>
            <button type="button" className="btn btn-secondary" onClick={seeTheAnswer}>
              See the answer
            </button>
            <button type="button" className="btn btn-primary" onClick={carryOn}>
              Continue
            </button>
          </>
        )}

        {phase === "revealed" && (
          <button type="button" className="btn btn-primary" onClick={() => onFinished("wrong")}>
            Continue
          </button>
        )}
      </div>

      <label className="mt-6 flex w-fit cursor-pointer items-center gap-2 text-sm text-slate-600 select-none dark:text-slate-300">
        <input
          type="checkbox"
          className="size-4 accent-indigo-600"
          checked={marked}
          onChange={() => void toggleMark()}
        />
        Mark this one as needing review
      </label>
    </>
  );
}

function label(itemType: string): string {
  if (itemType === "word") return "Word";
  if (itemType === "phrase") return "Phrase";
  if (itemType === "verb_table") return "Verb";
  return itemType;
}

function Finished({
  total,
  correct,
  wrong,
}: {
  total: number;
  correct: number;
  wrong: number;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
      <div className="card p-8 text-center">
        <div aria-hidden="true" className="mb-3 text-4xl">
          🎴
        </div>
        <h1 className="text-lg font-semibold">Deck finished</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
          {correct} of {total} known, {wrong} to come back to. What you did not know is due
          again sooner than what you did.
        </p>
        <Link href="/" className="btn btn-primary mt-5 inline-flex">
          Back to the home page
        </Link>
      </div>
    </main>
  );
}

function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <div className="card h-64 animate-pulse" aria-hidden="true" />
    </main>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
      <div className="card p-8 text-center">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
          {body}
        </p>
        <Link href="/" className="btn btn-primary mt-5 inline-flex">
          Back to the home page
        </Link>
      </div>
    </main>
  );
}
