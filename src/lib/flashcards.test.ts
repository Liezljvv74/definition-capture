import { describe, expect, it } from "vitest";

import {
  DEFAULT_DECK_SIZE,
  sizeOf,
  toDeckRequest,
  type CardSource,
  type DeckRequest,
} from "@/lib/flashcards";

/**
 * The translation between what the reader ticked and what the database
 * function takes.
 *
 * Worth testing because getting it wrong builds the wrong deck rather than
 * failing: ask for phrases, get everything, and nothing anywhere says so. The
 * awkward part is that two of the five options are not content types at all.
 * "All items" means put no restriction on type, and "Most recently added"
 * changes the ordering rather than the filter, so they travel as an empty
 * list and a boolean respectively.
 */
const ask = (over: Partial<DeckRequest> = {}): DeckRequest => ({
  sources: ["all"],
  categoryIds: [],
  needsReviewOnly: false,
  size: null,
  ...over,
});

describe("toDeckRequest", () => {
  it("sends no types for All items, which is how the default means everything", () => {
    const sent = toDeckRequest(ask({ sources: ["all"] }));
    expect(sent.sources).toEqual([]);
    expect(sent.only_recent).toBe(false);
  });

  it("sends nothing for an empty choice either, since it is the same request", () => {
    expect(toDeckRequest(ask({ sources: [] })).sources).toEqual([]);
  });

  it("sends the types that were chosen, and only those", () => {
    expect(toDeckRequest(ask({ sources: ["phrase"] })).sources).toEqual(["phrase"]);
    expect(toDeckRequest(ask({ sources: ["word", "verb_table"] })).sources).toEqual([
      "word",
      "verb_table",
    ]);
  });

  it("keeps the order the database expects, not the order they were ticked", () => {
    // The function takes a list to match against, so order is not meaningful
    // to it; pinning it anyway keeps the request stable and the deck's
    // `source_types` readable afterwards.
    expect(toDeckRequest(ask({ sources: ["verb_table", "word"] })).sources).toEqual([
      "word",
      "verb_table",
    ]);
  });

  it("treats Most recently added as an ordering, not as a type", () => {
    const sent = toDeckRequest(ask({ sources: ["recent"] }));
    expect(sent.only_recent).toBe(true);
    // No type restriction: "the most recent things" means across all of them.
    expect(sent.sources).toEqual([]);
  });

  it("can combine recency with a type", () => {
    const sent = toDeckRequest(ask({ sources: ["recent", "word"] }));
    expect(sent.only_recent).toBe(true);
    expect(sent.sources).toEqual(["word"]);
  });

  it("lets All items win over a type that is also ticked", () => {
    // The dialog does not allow this, and the translation must not depend on
    // the dialog behaving: both on means everything, not one of them.
    const sent = toDeckRequest(ask({ sources: ["all", "phrase"] as CardSource[] }));
    expect(sent.sources).toEqual([]);
  });

  it("passes the filters through as they are", () => {
    const sent = toDeckRequest(
      ask({ categoryIds: ["a", "b"], needsReviewOnly: true }),
    );
    expect(sent.category_ids).toEqual(["a", "b"]);
    expect(sent.only_needs_review).toBe(true);
  });
});

describe("sizeOf", () => {
  it("defaults when nothing was typed", () => {
    expect(sizeOf(null)).toBe(DEFAULT_DECK_SIZE);
  });

  it("defaults rather than failing on a number that makes no sense", () => {
    // The field is a number input, so these arrive from a paste or a URL
    // rather than from typing, and a deck of zero cards helps nobody.
    for (const nonsense of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(sizeOf(nonsense)).toBe(DEFAULT_DECK_SIZE);
    }
  });

  it("keeps a sensible number", () => {
    expect(sizeOf(1)).toBe(1);
    expect(sizeOf(20)).toBe(20);
    expect(sizeOf(500)).toBe(500);
  });

  it("clamps to what the database will accept rather than being refused by it", () => {
    // `flashcard_decks.requested_size` is checked between 1 and 500, so an
    // unclamped 9000 would come back as a constraint violation the reader
    // could do nothing with.
    expect(sizeOf(9000)).toBe(500);
  });

  it("takes a whole number of cards", () => {
    expect(sizeOf(12.7)).toBe(12);
  });
});
