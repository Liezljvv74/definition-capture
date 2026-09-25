import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadDeck } from "@/lib/flashcards";

/**
 * Reading a deck back is one request: `deck_cards` in position order, each
 * with its item embedded, and the card back built by `cardBack`.
 *
 * The order is asked of the database rather than reimposed afterwards, so the
 * thing to pin is that the request asks for it, and that the mapping keeps the
 * rows in the order they arrive. A card whose item has gone (deleted since the
 * deck was built) comes back with no item and must be dropped rather than
 * shown blank.
 *
 * A fake client rather than a database: these are decisions in the request
 * and the mapping, and those are what this can see.
 */
type Answer = { data: unknown[] | null; error: unknown };

const asked: { table: string; select?: string; order?: string; eq?: [string, string] }[] = [];
let deckRows: unknown[] = [];
let deckError: unknown = null;

vi.mock("@/lib/supabaseClient", () => ({
  getSupabase: () => ({
    from: (table: string) => ({
      select: (columns: string) => {
        const call: (typeof asked)[number] = { table, select: columns };
        const self = {
          eq(column: string, value: string) {
            call.eq = [column, value];
            return self;
          },
          order(column: string) {
            call.order = column;
            return self;
          },
          then<R>(onOk: (answer: Answer) => R): Promise<R> {
            asked.push(call);
            return Promise.resolve<Answer>({
              data: deckError ? null : deckRows,
              error: deckError,
            }).then(onOk);
          },
        };
        return self;
      },
    }),
  }),
}));

const card = (id: string, over: Record<string, unknown> = {}) => ({
  position: 1,
  items: {
    id,
    item_type: "word",
    title: `front ${id}`,
    definition: `back ${id}`,
    literal_meaning: null,
    usage_example: null,
    tenses: null,
    verb_rows: null,
    needs_review: false,
    ...over,
  },
});

beforeEach(() => {
  asked.length = 0;
  deckError = null;
});

describe("loadDeck", () => {
  it("asks for this deck's cards in position order, in one request", async () => {
    deckRows = [card("a")];
    await loadDeck("deck-1");

    expect(asked).toHaveLength(1);
    expect(asked[0].table).toBe("deck_cards");
    expect(asked[0].eq).toEqual(["deck_id", "deck-1"]);
    expect(asked[0].order).toBe("position");
    expect(asked[0].select).toContain("items(");
  });

  it("keeps the order the rows arrive in", async () => {
    deckRows = [card("c"), card("a"), card("b")];
    const cards = await loadDeck("deck-1");

    expect(cards.map((c) => c.id)).toEqual(["c", "a", "b"]);
    expect(cards[0].front).toBe("front c");
    expect(cards[0].back).toBe("back c");
  });

  it("drops a card whose item has gone rather than showing a blank one", async () => {
    deckRows = [card("a"), { position: 2, items: null }, card("b")];
    const cards = await loadDeck("deck-1");

    expect(cards.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("carries whether the item is already flagged for review", async () => {
    deckRows = [card("a", { needs_review: true }), card("b")];
    const cards = await loadDeck("deck-1");

    expect(cards.map((c) => c.needsReview)).toEqual([true, false]);
  });

  it("builds each back from the item's own fields", async () => {
    deckRows = [
      card("p", {
        item_type: "phrase",
        definition: null,
        literal_meaning: "good day",
        usage_example: "Guten Tag.",
      }),
    ];
    const [phrase] = await loadDeck("deck-1");

    expect(phrase.itemType).toBe("phrase");
    expect(phrase.back).toBe("good day\n\nGuten Tag.");
  });

  it("reads an empty deck, including one pruned in another tab, as no cards", async () => {
    deckRows = [];
    expect(await loadDeck("deck-1")).toEqual([]);
  });

  it("says what failed when the deck cannot be read", async () => {
    deckError = { message: "boom" };
    await expect(loadDeck("deck-1")).rejects.toThrow("Could not read the deck");
  });
});
