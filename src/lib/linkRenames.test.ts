import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` factories are hoisted above this file's own declarations, so
// anything they read has to be hoisted with them.
const { words, updateEntries, updatePhrases, updateVerbTables, updateRules } = vi.hoisted(() => ({
  words: [{ id: "w1", word: "geben", ref: "uses [[Dativ]]" }],
  updateEntries: vi.fn(),
  updatePhrases: vi.fn(),
  updateVerbTables: vi.fn(),
  updateRules: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({ getEntries: () => words, updateEntries }));
vi.mock("@/lib/phraseStorage", () => ({ getPhrases: () => [], updatePhrases }));
vi.mock("@/lib/verbTables", () => ({ getVerbTables: () => [], updateVerbTables }));
vi.mock("@/lib/rules", () => ({
  getRules: () => [{ id: "r1", title: "Dativ Fall", blocks: [] }],
  updateRules,
}));

import { rewriteLinks } from "@/lib/linkRenames";

describe("rewriteLinks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends only the lists that changed to their stores", () => {
    rewriteLinks("rule", "r1", "Dativ", "Dativ Fall");
    expect(updateEntries).toHaveBeenCalledWith([{ id: "w1", word: "geben", ref: "uses [[Dativ Fall]]" }]);
    expect(updatePhrases).not.toHaveBeenCalled();
    expect(updateVerbTables).not.toHaveBeenCalled();
    expect(updateRules).not.toHaveBeenCalled();
  });
});
