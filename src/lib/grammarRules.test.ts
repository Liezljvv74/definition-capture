import { describe, expect, it } from "vitest";

import { parseGrammarRule, parseGrammarRuleList } from "@/lib/grammarRules";

/**
 * The reader between a backup file and the grammar list. The store's merge
 * logic is `planImport`, which is tested on its own; what is left here is the
 * part specific to a rule — which fields survive a hand-edited file, and what
 * makes one unusable.
 */
describe("parseGrammarRule", () => {
  const full = {
    id: "11111111-1111-1111-1111-111111111111",
    title: "Dative after mit",
    category: "Cases",
    explanation: "mit always takes the dative.",
    examples: "mit dem Bus\nmit meiner Schwester",
    ref: "[[Dativ]] p.42",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("reads every field", () => {
    expect(parseGrammarRule(full)).toEqual(full);
  });

  it("keeps the line breaks in examples, which are the point of the field", () => {
    const rule = parseGrammarRule(full);
    expect(rule?.examples.split("\n")).toHaveLength(2);
  });

  it("refuses a rule with no title, since the title is its identity", () => {
    expect(parseGrammarRule({ ...full, title: "" })).toBeNull();
    expect(parseGrammarRule({ ...full, title: "   " })).toBeNull();
    expect(parseGrammarRule({ ...full, title: 42 })).toBeNull();
  });

  it("refuses an id-less rule unless the caller is going to assign one", () => {
    const { ...withoutId } = full;
    delete (withoutId as Record<string, unknown>).id;

    expect(parseGrammarRule(withoutId)).toBeNull();
    expect(parseGrammarRule(withoutId, true)).toMatchObject({ id: "" });
  });

  it("treats a missing category as unfiled rather than unusable", () => {
    // Blank is a real state: a rule is often captured before there is a name
    // for the group it belongs to.
    expect(parseGrammarRule({ ...full, category: undefined })).toMatchObject({
      category: "",
    });
  });

  it("fills in the optional text fields rather than leaving them undefined", () => {
    const sparse = parseGrammarRule({ id: full.id, title: "Word order" });
    expect(sparse).toMatchObject({
      category: "",
      explanation: "",
      examples: "",
      ref: "",
    });
  });

  it("invents a createdAt when the file has none, so ordering still works", () => {
    const rule = parseGrammarRule({ id: full.id, title: "Word order" });
    expect(rule?.createdAt).not.toBe("");
    expect(Number.isNaN(Date.parse(rule!.createdAt))).toBe(false);
  });

  it("trims the title and category but not the body text", () => {
    const rule = parseGrammarRule({
      ...full,
      title: "  Dative after mit  ",
      category: "  Cases  ",
      explanation: "  keeps its shape  ",
    });
    expect(rule?.title).toBe("Dative after mit");
    expect(rule?.category).toBe("Cases");
    expect(rule?.explanation).toBe("  keeps its shape  ");
  });

  it("refuses anything that is not an object", () => {
    for (const junk of [null, undefined, 42, "a", []]) {
      expect(parseGrammarRule(junk)).toBeNull();
    }
  });
});

describe("parseGrammarRuleList", () => {
  it("keeps what it can read and counts what it cannot", () => {
    const { rules, unreadable } = parseGrammarRuleList([
      { title: "Dative after mit" },
      null,
      42,
      {},
      { title: "Word order" },
    ]);

    expect(rules.map((rule) => rule.title)).toEqual([
      "Dative after mit",
      "Word order",
    ]);
    expect(unreadable).toBe(3);
  });

  it("is empty for an empty list", () => {
    expect(parseGrammarRuleList([])).toEqual({ rules: [], unreadable: 0 });
  });
});
