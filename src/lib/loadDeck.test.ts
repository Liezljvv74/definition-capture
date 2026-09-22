import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadDeck } from "@/lib/flashcards";

/**
 * Reading a deck back is two queries and a join done in TypeScript, and every
 * part of that join is a decision nothing else records.
 *
 * `in (...)` makes no promise about the order rows come back in, so the deck's
 * order has to be reimposed from `deck_items.position`, and the deck's order
 * is the whole reason that column exists. Replacing the reordering with the
 * faces as they arrived would leave every test in the repo green and hand
 * readers a shuffled deck.
 *
 * The ids also go in batches, because a deck of five hundred would otherwise
 * put roughly nineteen kilobytes of ids in one request line.
 *
 * A fake client rather than a database: these are decisions in the mapping,
 * and the mapping is what this can see.
 */
type Answer = { data: unknown[] | null; error: unknown };

const asked: { table: string; ids?: string[] }[] = [];
let deckRows: unknown[] = [];
let faceRows: unknown[] = [];
let faceError: unknown = null;

function builder(table: string) {
  const call: { table: string; ids?: string[] } = { table };
  const self = {
    eq: () => self,
    order: () => self,
    in(_column: string, values: string[]) {
      call.ids = values;
      return self;
    },
    then<R>(onOk: (answer: Answer) => R): Promise<R> {
      asked.push(call);
      const answer: Answer =
        table === "deck_items"
          ? { data: deckRows, error: null }
          : {
              data: faceError ? null : faceRows.filter((row) => matches(row, call.ids ?? [])),
              error: faceError,
            };
      return Promise.resolve(answer).then(onOk);
    },
  };
  return self;
}

const matches = (row: unknown, ids: string[]) =>
  ids.includes(String((row as { id: string }).id));

vi.mock("@/lib/supabaseClient", () => ({
  getSupabase: () => ({
    from: (table: string) => ({ select: () => builder(table) }),
  }),
}));

const face = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  item_type: "word",
  front: `front ${id}`,
  back: `back ${id}`,
  needs_review: false,
  ...over,
});

beforeEach(() => {
  asked.length = 0;
  faceError = null;
});

describe("loadDeck", () => {
  it("returns the cards in the deck's order, not the database's", () => {
    deckRows = [{ item_id: "c" }, { item_id: "a" }, { item_id: "b" }];
    // Deliberately the other way round, which is what `in` is entitled to do.
    faceRows = [face("a"), face("b"), face("c")];

    return loadDeck("deck-1").then((cards) => {
      expect(cards.map((card) => card.id)).toEqual(["c", "a", "b"]);
      expect(cards[0].front).toBe("front c");
    });
  });

  it("drops a card whose face has gone rather than showing a blank one", () => {
    deckRows = [{ item_id: "a" }, { item_id: "deleted" }, { item_id: "b" }];
    faceRows = [face("a"), face("b")];

    return loadDeck("deck-1").then((cards) => {
      expect(cards.map((card) => card.id)).toEqual(["a", "b"]);
    });
  });

  it("carries whether the item is already flagged for review", () => {
    deckRows = [{ item_id: "a" }, { item_id: "b" }];
    faceRows = [face("a", { needs_review: true }), face("b")];

    return loadDeck("deck-1").then((cards) => {
      expect(cards.map((card) => card.needsReview)).toEqual([true, false]);
    });
  });

  it("asks for the faces in batches, so the request line stays short", () => {
    const ids = Array.from({ length: 450 }, (_, at) => `item-${at}`);
    deckRows = ids.map((id) => ({ item_id: id }));
    faceRows = ids.map((id) => face(id));

    return loadDeck("deck-1").then((cards) => {
      expect(cards).toHaveLength(450);

      const batches = asked.filter((call) => call.table === "card_faces");
      expect(batches).toHaveLength(3);
      expect(batches.map((call) => call.ids?.length)).toEqual([200, 200, 50]);
    });
  });

  it("asks for nothing at all when the deck is empty", () => {
    deckRows = [];
    faceRows = [];

    return loadDeck("deck-1").then((cards) => {
      expect(cards).toEqual([]);
      expect(asked.filter((call) => call.table === "card_faces")).toHaveLength(0);
    });
  });

  it("says which half failed when the faces cannot be read", () => {
    deckRows = [{ item_id: "a" }];
    faceRows = [face("a")];
    faceError = { message: "boom" };

    return expect(loadDeck("deck-1")).rejects.toThrow("Could not read the cards");
  });
});
