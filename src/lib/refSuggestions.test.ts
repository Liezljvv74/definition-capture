import { describe, expect, it } from "vitest";

import { linkTargets } from "@/lib/links";
import { suggestRefs } from "@/lib/refSuggestions";
import type { Rule, VerbTable } from "@/lib/types";

const rule: Rule = { id: "r", title: "Dativ", topic: "Cases", blocks: [], dateAdded: "", dateUpdated: null };
const table: VerbTable = { id: "t", verb: "danken", tenses: [""], rows: [], createdAt: "", ref: "" };

describe("suggestRefs", () => {
  it("offers rules and verb tables, labelled by kind", () => {
    const targets = linkTargets([], [], [table], [rule]);
    expect(suggestRefs(targets, "da")).toEqual([
      { name: "danken", kind: "verb_table" },
      { name: "Dativ", kind: "rule" },
    ]);
  });

  it("offers a shared name once, as the kind the link will reach", () => {
    const targets = linkTargets([], [], [{ ...table, verb: "Dativ" }], [rule]);
    expect(suggestRefs(targets, "dat")).toEqual([{ name: "Dativ", kind: "rule" }]);
  });
});

describe("suggestRefs, leaving out the item being edited", () => {
  const word = {
    id: "w", word: "arbeiten", definition: "", ref: "", collections: [], source: "Manual",
    dateAdded: "", dateUpdated: null, needsDefinition: false,
  };
  const arbeiten: VerbTable = { ...table, id: "t2", verb: "arbeiten" };

  it("offers a word its own verb table, which shares its name", () => {
    const targets = linkTargets([word], [], [arbeiten], []);
    expect(suggestRefs(targets, "arb", ["arbeiten"], undefined, "word")).toEqual([
      { name: "arbeiten", kind: "verb_table" },
    ]);
  });

  it("does not offer a verb table itself, since the link would reach the table", () => {
    const targets = linkTargets([word], [], [arbeiten], []);
    expect(suggestRefs(targets, "arb", ["arbeiten"], undefined, "verb_table")).toEqual([]);
  });
});
