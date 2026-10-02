import { describe, expect, it } from "vitest";

import { searchRules } from "@/lib/ruleSearch";
import type { Block, Rule } from "@/lib/types";

const rule = (title: string, blocks: Block[]): Rule => ({
  id: title,
  title,
  topic: "Cases",
  blocks,
  dateAdded: "2026-10-01T00:00:00Z",
  dateUpdated: null,
});

const rules = [
  rule("Dative prepositions", [
    { kind: "text", id: "a", text: "After **mit**, **bei** and **nach** the noun takes the dative." },
  ]),
  rule("Two-way prepositions", [
    { kind: "table", id: "b", headerRow: true, headerColumn: false, cells: [["Where?", "Where to?"], ["in dem", "in den"]] },
  ]),
  rule("Separable verbs", [
    { kind: "example", id: "c", sentence: "Ich rufe dich {an}.", translation: "I call you." },
  ]),
  rule("Adverb position", [{ kind: "text", id: "d", text: "The verb comes second, even after mit." }]),
];

describe("searchRules", () => {
  it("finds rules that mention a word anywhere in their text, not only the title", () => {
    expect(searchRules(rules, "nach", "").map((m) => m.title)).toEqual(["Dative prepositions"]);
    expect(searchRules(rules, "den", "").map((m) => m.title)).toEqual(["Two-way prepositions"]);
    expect(searchRules(rules, "rufe", "").map((m) => m.title)).toEqual(["Separable verbs"]);
  });

  it("matches any of several selected words, the rule with the most first", () => {
    const found = searchRules(rules, "mit nach", "");
    expect(found.map((m) => m.title)).toEqual(["Dative prepositions", "Adverb position"]);
    expect(found[0].hits).toBe(2);
  });

  it("ignores capitals but not accents", () => {
    expect(searchRules(rules, "MIT", "")).toHaveLength(2);
    expect(searchRules([rule("Für", [{ kind: "text", id: "e", text: "für takes the accusative" }])], "fur", "")).toEqual([]);
  });

  it("leaves out the rule being read, and names a link cannot hold", () => {
    expect(searchRules(rules, "mit", "Adverb position").map((m) => m.title)).toEqual(["Dative prepositions"]);
    expect(searchRules([rule("a|b", [{ kind: "text", id: "f", text: "mit" }])], "mit", "")).toEqual([]);
  });

  it("shows where it matched, without the text markup", () => {
    const [match] = searchRules(rules, "bei", "");
    expect(match.snippet).toContain("bei");
    expect(match.snippet).not.toContain("**");
  });

  it("finds nothing for an empty or one-letter query", () => {
    expect(searchRules(rules, "", "")).toEqual([]);
    expect(searchRules(rules, "a", "")).toEqual([]);
  });
});
