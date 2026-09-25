import { describe, expect, it } from "vitest";

import {
  cardBack,
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
  collectionIds: [],
  needsReviewOnly: false,
  size: null,
  ...over,
});

describe("toDeckRequest", () => {
  it("sends no types for All items, which is how the default means everything", () => {
    const sent = toDeckRequest(ask({ sources: ["all"] }));
    expect(sent.item_types).toEqual([]);
    expect(sent.only_recent).toBe(false);
  });

  it("sends nothing for an empty choice either, since it is the same request", () => {
    expect(toDeckRequest(ask({ sources: [] })).item_types).toEqual([]);
  });

  it("sends the types that were chosen, and only those", () => {
    expect(toDeckRequest(ask({ sources: ["phrase"] })).item_types).toEqual(["phrase"]);
    expect(toDeckRequest(ask({ sources: ["word", "verb_table"] })).item_types).toEqual([
      "word",
      "verb_table",
    ]);
  });

  it("keeps the order the database expects, not the order they were ticked", () => {
    // The function takes a list to match against, so order is not meaningful
    // to it; pinning it anyway keeps the request stable and readable in a
    // log.
    expect(toDeckRequest(ask({ sources: ["verb_table", "word"] })).item_types).toEqual([
      "word",
      "verb_table",
    ]);
  });

  it("treats Most recently added as an ordering, not as a type", () => {
    const sent = toDeckRequest(ask({ sources: ["recent"] }));
    expect(sent.only_recent).toBe(true);
    // No type restriction: "the most recent things" means across all of them.
    expect(sent.item_types).toEqual([]);
  });

  it("can combine recency with a type", () => {
    const sent = toDeckRequest(ask({ sources: ["recent", "word"] }));
    expect(sent.only_recent).toBe(true);
    expect(sent.item_types).toEqual(["word"]);
  });

  it("lets All items win over a type that is also ticked", () => {
    // The dialog does not allow this, and the translation must not depend on
    // the dialog behaving: both on means everything, not one of them.
    const sent = toDeckRequest(ask({ sources: ["all", "phrase"] as CardSource[] }));
    expect(sent.item_types).toEqual([]);
  });

  it("passes the filters through as they are", () => {
    const sent = toDeckRequest(
      ask({ collectionIds: ["a", "b"], needsReviewOnly: true }),
    );
    expect(sent.tag_ids).toEqual(["a", "b"]);
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
    // `build_deck` clamps to between 1 and 500 as well, so an unclamped 9000
    // would quietly become 500 there; clamping here keeps the number the
    // dialog shows and the deck that arrives the same.
    expect(sizeOf(9000)).toBe(500);
  });

  it("takes a whole number of cards", () => {
    expect(sizeOf(12.7)).toBe(12);
  });
});

describe("cardBack", () => {
  const item = (over: Partial<Parameters<typeof cardBack>[0]>) => ({
    item_type: "word",
    title: "t",
    definition: null,
    literal_meaning: null,
    usage_example: null,
    tenses: null,
    verb_rows: null,
    ...over,
  });

  it("is a word's definition", () => {
    expect(cardBack(item({ definition: "the dog" }))).toBe("the dog");
  });

  it("is a phrase's meaning and example, skipping whichever is blank", () => {
    expect(cardBack(item({ item_type: "phrase", literal_meaning: "a", usage_example: "b" }))).toBe(
      "a\n\nb",
    );
    expect(cardBack(item({ item_type: "phrase", literal_meaning: "", usage_example: "b" }))).toBe(
      "b",
    );
  });

  it("is a verb's conjugations, one person per line, lined up with the tenses", () => {
    const back = cardBack(
      item({
        item_type: "verb_table",
        tenses: ["Präsens", "Präteritum"],
        verb_rows: [
          { person: "ich", conjugations: ["gehe", "ging"], notes: "" },
          { person: "du", conjugations: ["gehst", ""], notes: "" },
          { person: "er", conjugations: ["", ""], notes: "" },
        ],
      }),
    );
    expect(back.split("\n")).toEqual([
      "ich: Präsens gehe  ·  Präteritum ging",
      "du: Präsens gehst",
      "er: (not filled in)",
    ]);
  });

  /**
   * `items.has_answer` is the database's copy of one rule: whether a card has
   * a back at all. A deck is filled with items where it is true, so if it
   * disagreed with this function a deck could hold cards with blank backs, or
   * leave out cards that have one. This is that rule as the migration
   * `refactor_build_new_schema` writes it; change either, change both.
   */
  const hasAnswer = (row: ReturnType<typeof item>) => {
    switch (row.item_type) {
      case "word":
        return (row.definition ?? "") !== "";
      case "phrase":
        return (row.literal_meaning ?? "") !== "" || (row.usage_example ?? "") !== "";
      case "verb_table":
        return Array.isArray(row.verb_rows) && row.verb_rows.length > 0;
      default:
        return false;
    }
  };

  it("has a back exactly when the database says the item has an answer", () => {
    const cases = [
      item({ definition: "x" }),
      item({ definition: "" }),
      item({ item_type: "phrase", literal_meaning: "", usage_example: "" }),
      item({ item_type: "phrase", literal_meaning: "", usage_example: "y" }),
      item({ item_type: "phrase", literal_meaning: "z", usage_example: "" }),
      item({ item_type: "verb_table", tenses: ["P"], verb_rows: [] }),
      item({
        item_type: "verb_table",
        tenses: ["P"],
        verb_rows: [{ person: "ich", conjugations: [""], notes: "" }],
      }),
    ];
    for (const row of cases) {
      expect(cardBack(row) !== "", JSON.stringify(row)).toBe(hasAnswer(row));
    }
  });
});
