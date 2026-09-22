"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { Modal } from "@/components/Modal";
import {
  buildDeck,
  countMatching,
  DEFAULT_DECK_SIZE,
  FlashcardError,
  listCategories,
  SOURCE_LABELS,
  SOURCE_ORDER,
  type CardSource,
  type Category,
  type DeckRequest,
} from "@/lib/flashcards";

/**
 * Choose what a deck is drawn from, narrow it, say how many, and go.
 *
 * Sources are checkboxes rather than a dropdown because the brief is that one
 * or many may be picked, and a multi-select dropdown hides from the reader
 * what they have chosen at the moment they are choosing it.
 *
 * "All items" is the default and behaves as a switch rather than as a fourth
 * type: ticking it clears the individual types, and ticking a type clears it.
 * Two ways of saying "everything" that could both be on at once would be one
 * way too many.
 */
export function CreateDeckDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const ids = useId();

  const [sources, setSources] = useState<CardSource[]>(["all"]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  const [size, setSize] = useState("");

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [available, setAvailable] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request: DeckRequest = {
    sources,
    categoryIds,
    needsReviewOnly,
    size: size.trim() === "" ? null : Number(size),
  };

  useEffect(() => {
    let current = true;
    void listCategories()
      .then((found) => {
        if (current) setCategories(found);
      })
      .catch(() => {
        // A failure here costs the category filter and nothing else, so the
        // dialog carries on without it rather than refusing to open.
        if (current) setCategories([]);
      });
    return () => {
      current = false;
    };
  }, []);

  // Recounted as the sources and the review filter change, so "50" can be
  // seen to be more than there is before the deck is built rather than after.
  useEffect(() => {
    let current = true;
    void countMatching({ sources, categoryIds: [], needsReviewOnly, size: null })
      .then((found) => {
        if (current) setAvailable(found);
      })
      .catch(() => {
        if (current) setAvailable(null);
      });
    return () => {
      current = false;
    };
  }, [sources, needsReviewOnly]);

  function toggleSource(source: CardSource) {
    setSources((current) => {
      if (source === "all") return ["all"];
      const without = current.filter((value) => value !== "all");
      const next = without.includes(source)
        ? without.filter((value) => value !== source)
        : [...without, source];
      // Unticking the last one is the same request as ticking All items, so
      // it says so rather than leaving nothing selected and no deck possible.
      return next.length === 0 ? ["all"] : next;
    });
  }

  function toggleCategory(id: string) {
    setCategoryIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const deckId = await buildDeck(request);
      router.push(`/flashcards/?deck=${deckId}`);
    } catch (cause) {
      setBusy(false);
      setError(
        cause instanceof FlashcardError
          ? cause.message
          : "The deck could not be built. Please try again.",
      );
    }
  }

  const nothingToDrawFrom = available === 0;

  return (
    <Modal title="Create flashcards" onClose={() => (busy ? undefined : onClose())}>
      <div className="space-y-5">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">What to draw from</legend>
          <div className="flex flex-col gap-2">
            {SOURCE_ORDER.map((source) => (
              <label
                key={source}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition ${
                  sources.includes(source)
                    ? "border-indigo-500 bg-indigo-50/60 dark:border-indigo-400 dark:bg-indigo-500/10"
                    : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                }`}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-indigo-600"
                  checked={sources.includes(source)}
                  disabled={busy}
                  onChange={() => toggleSource(source)}
                />
                <span className="font-medium">{SOURCE_LABELS[source]}</span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {available === null
              ? "Counting what you have…"
              : `${available} ${available === 1 ? "item has" : "items have"} an answer to show.`}
          </p>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Narrow it down</legend>

          <label className="flex cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-indigo-600"
              checked={needsReviewOnly}
              disabled={busy}
              onChange={(event) => setNeedsReviewOnly(event.target.checked)}
            />
            Only items marked as needing review
          </label>

          {categories === null ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Loading your categories…
            </p>
          ) : categories.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Nothing is filed under a category yet, so there is nothing to narrow by.
            </p>
          ) : (
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-slate-500 dark:text-slate-400">
                Categories. Choosing none means all of them.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((category) => {
                  const on = categoryIds.includes(category.id);
                  return (
                    <button
                      key={category.id}
                      type="button"
                      disabled={busy}
                      onClick={() => toggleCategory(category.id)}
                      aria-pressed={on}
                      className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition ${
                        on
                          ? "border-indigo-500 bg-indigo-600 text-white"
                          : "border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      }`}
                    >
                      {category.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </fieldset>

        <div>
          <label htmlFor={`${ids}-size`} className="mb-1 block text-sm font-medium">
            How many cards
          </label>
          <input
            id={`${ids}-size`}
            className="field w-32"
            type="number"
            min={1}
            max={500}
            inputMode="numeric"
            placeholder={String(DEFAULT_DECK_SIZE)}
            value={size}
            disabled={busy}
            onChange={(event) => setSize(event.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Leave it blank for {DEFAULT_DECK_SIZE}. If you ask for more than you have, you
            get what there is.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || nothingToDrawFrom}
            onClick={() => void generate()}
          >
            {busy ? "Building…" : "Generate deck"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
