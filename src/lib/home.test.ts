import { describe, expect, it } from "vitest";

import {
  itemHref,
  plural,
  QUOTES,
  quoteFor,
  progressParts,
  readRecent,
  readRemember,
  readSummary,
  relativeDay,
  reviewState,
  typeLabel,
  type HomeSummary,
} from "@/lib/home";

const summary = (over: Partial<HomeSummary> = {}): HomeSummary => ({
  words: 0, wordsWithoutDefinition: 0, phrases: 0, verbTables: 0, grammarRules: 0,
  due: 0, newItems: 0, learning: 0, learned: 0,
  nextDueAt: null, lastSavedAt: null, rememberId: null,
  verbTensesDue: 0, verbTensesNew: 0, verbsNew: 0, verbsLearning: 0, verbsLearned: 0,
  ...over,
});

const NOW = new Date("2026-10-02T00:10:00Z");

describe("readSummary", () => {
  it("maps the database's snake_case row", () => {
    const s = readSummary({
      words: 3, words_without_definition: 1, phrases: 2, verb_tables: 4, grammar_rules: 5,
      due: 6, new_items: 7, learning: 8, learned: 9,
      next_due_at: "2026-10-03T00:00:00Z", last_saved_at: "2026-10-01T00:00:00Z", remember_id: "abc",
      verb_tenses_due: 10, verb_tenses_new: 11, verbs_new: 12, verbs_learning: 13, verbs_learned: 14,
    });
    expect(s).toEqual({
      words: 3, wordsWithoutDefinition: 1, phrases: 2, verbTables: 4, grammarRules: 5,
      due: 6, newItems: 7, learning: 8, learned: 9,
      nextDueAt: "2026-10-03T00:00:00Z", lastSavedAt: "2026-10-01T00:00:00Z", rememberId: "abc",
      verbTensesDue: 10, verbTensesNew: 11, verbsNew: 12, verbsLearning: 13, verbsLearned: 14,
    });
  });

  it("reads a missing row as an empty account", () => {
    expect(readSummary(null)).toEqual(summary());
  });
});

describe("reviewState", () => {
  it("offers due cards first", () => {
    expect(reviewState(summary({ due: 14, newItems: 3, learning: 14 }), NOW)).toEqual({ kind: "due", count: 14 });
  });

  it("offers new items when nothing is due", () => {
    expect(reviewState(summary({ newItems: 9 }), NOW)).toEqual({ kind: "new", count: 9 });
  });

  it("is caught up when every card has been answered and none is due", () => {
    expect(reviewState(summary({ learned: 4, nextDueAt: "2026-10-03T08:00:00Z" }), NOW))
      .toEqual({ kind: "caughtUp", next: "tomorrow" });
  });

  it("says nothing to review when there are items but none makes a card", () => {
    // Words saved without definitions: "Capture your first word" would be wrong.
    expect(reviewState(summary({ words: 9, wordsWithoutDefinition: 9 }), NOW)).toEqual({ kind: "noCards" });
    expect(reviewState(summary({ grammarRules: 2 }), NOW)).toEqual({ kind: "noCards" });
  });

  it("is empty for a brand-new account", () => {
    expect(reviewState(summary(), NOW)).toEqual({ kind: "empty" });
  });
});

describe("relativeDay", () => {
  it("counts calendar days, not 24-hour spans", () => {
    // 20 minutes earlier, but on the previous day.
    expect(relativeDay("2026-10-01T23:50:00Z", NOW)).toBe("yesterday");
    expect(relativeDay("2026-10-02T00:05:00Z", NOW)).toBe("today");
    expect(relativeDay("2026-09-29T12:00:00Z", NOW)).toBe("3 days ago");
  });

  it("reads the future the same way", () => {
    expect(relativeDay("2026-10-03T08:00:00Z", NOW)).toBe("tomorrow");
    expect(relativeDay("2026-10-05T08:00:00Z", NOW)).toBe("in 3 days");
    expect(relativeDay("2026-10-02T20:00:00Z", NOW)).toBe("later today");
  });
});

describe("progressParts", () => {
  it("splits the bar by count, in New, Learning, Learned order", () => {
    const parts = progressParts(summary({ newItems: 1, learning: 1, learned: 2 }));
    expect(parts.map((p) => [p.label, p.count, p.percent])).toEqual([
      ["New", 1, 25], ["Learning", 1, 25], ["Learned", 2, 50],
    ]);
  });

  it("counts a verb by its tenses alongside the words and phrases", () => {
    const parts = progressParts(summary({ newItems: 1, verbsNew: 1, learning: 0, verbsLearning: 2, learned: 3, verbsLearned: 1 }));
    expect(parts.map((p) => [p.label, p.count])).toEqual([["New", 2], ["Learning", 2], ["Learned", 4]]);
  });

  it("gives zero widths rather than dividing by zero", () => {
    expect(progressParts(summary()).every((p) => p.percent === 0)).toBe(true);
  });
});

describe("readRecent", () => {
  it("takes the first collection by position and ignores a grammar topic", () => {
    const item = readRecent({
      id: "1", item_type: "word", title: "Idempotent", created_at: "2026-10-01T00:00:00Z",
      item_tags: [
        { position: 1, context: "collection", tags: { name: "Office" } },
        { position: 0, context: "collection", tags: { name: "Food" } },
        { position: 0, context: "grammar", tags: { name: "Tenses" } },
      ],
    });
    expect(item).toEqual({ id: "1", itemType: "word", title: "Idempotent", collection: "Food", createdAt: "2026-10-01T00:00:00Z" });
  });

  it("has no collection when none is linked", () => {
    expect(readRecent({ id: "1", item_type: "grammar", title: "R", created_at: "x", item_tags: [] }).collection).toBeNull();
  });
});

describe("links and labels", () => {
  it("sends each type to its own page", () => {
    expect(itemHref({ id: "a", itemType: "word", title: "w" })).toBe("/word/?id=a");
    expect(itemHref({ id: "a", itemType: "phrase", title: "p" })).toBe("/phrase/?id=a");
    expect(itemHref({ id: "a", itemType: "grammar", title: "g" })).toBe("/rule/?id=a");
    // Verb tables have no page of their own; the list opens the named one.
    expect(itemHref({ id: "a", itemType: "verb_table", title: "être fort" })).toBe("/verbs/?verb=%C3%AAtre%20fort");
  });

  it("labels each type", () => {
    expect(["word", "phrase", "verb_table", "grammar"].map(typeLabel))
      .toEqual(["Vocabulary", "Phrases", "Verb table", "Grammar"]);
  });
});

describe("readRemember", () => {
  it("is null when the random item has gone, so the card is simply left out", () => {
    // Deleted in another tab between the summary and this fetch.
    expect(readRemember(null)).toBeNull();
  });

  it("keeps the columns cardBack reads", () => {
    const item = readRemember({ id: "1", item_type: "word", title: "w", definition: "d",
      literal_meaning: null, usage_example: null, tenses: null, verb_rows: null });
    expect(item).toMatchObject({ id: "1", item_type: "word", title: "w", definition: "d" });
  });
});

describe("plural", () => {
  it("uses the singular only for exactly one", () => {
    expect([0, 1, 2].map((n) => plural(n, "word", "words"))).toEqual(["0 words", "1 word", "2 words"]);
  });
});

describe("quoteFor", () => {
  it("steps through every quote on consecutive seconds and wraps around", () => {
    const base = Math.ceil(NOW.getTime() / 1000 / QUOTES.length) * QUOTES.length;
    for (let i = 0; i <= QUOTES.length; i++) {
      expect(quoteFor(new Date((base + i) * 1000))).toBe(QUOTES[i % QUOTES.length]);
    }
  });

  it("has no em dash in any quote or attribution", () => {
    for (const q of QUOTES) expect(`${q.text}${q.by}`).not.toContain("—");
  });
});
