import { describe, expect, it } from "vitest";

import { splitWordAndDefinition } from "@/lib/parseWord";

describe("splitWordAndDefinition", () => {
  it("splits on a colon", () => {
    expect(splitWordAndDefinition("Tür: door")).toEqual({
      word: "Tür",
      definition: "door",
    });
  });

  it("splits on a spaced hyphen, en dash or em dash", () => {
    for (const dash of ["-", "–", "—"]) {
      expect(splitWordAndDefinition(`Tür ${dash} door`)).toEqual({
        word: "Tür",
        definition: "door",
      });
    }
  });

  it("leaves an unspaced dash alone, so compounds survive", () => {
    // `Tür-Rahmen` is a single compound, not a word and its definition.
    expect(splitWordAndDefinition("Tür-Rahmen")).toBeNull();
  });

  it("trims both halves", () => {
    expect(splitWordAndDefinition("  Tür  :  door  ")).toEqual({
      word: "Tür",
      definition: "door",
    });
  });

  it("splits on the leftmost separator, whichever kind it is", () => {
    expect(splitWordAndDefinition("Guten Tag - hallo: greeting")).toEqual({
      word: "Guten Tag",
      definition: "hallo: greeting",
    });
    expect(splitWordAndDefinition("Wort: a - b")).toEqual({
      word: "Wort",
      definition: "a - b",
    });
  });

  it("does not split a pasted URL on its scheme colon", () => {
    expect(splitWordAndDefinition("https://example.com")).toBeNull();
  });

  it("gives up on a URL even when a usable dash follows — a known limit", () => {
    // Only the leftmost separator is checked against `://`, so the perfectly
    // good dash split is never reached. Harmless (the paste is left alone)
    // but pinned, because the asymmetry is easy to "fix" into a regression.
    expect(splitWordAndDefinition("https://example.com - a site")).toBeNull();
  });

  it("returns null when either half is empty", () => {
    for (const input of ["", "   ", ":", ": def", "word:", "word:   "]) {
      expect(splitWordAndDefinition(input)).toBeNull();
    }
  });

  it("returns null when the first half is prose rather than a word", () => {
    const long = "x".repeat(81);
    expect(splitWordAndDefinition(`${long}: def`)).toBeNull();
    expect(splitWordAndDefinition(`${"x".repeat(80)}: def`)).toMatchObject({
      definition: "def",
    });
  });

  it("measures that length in UTF-16 units, so astral characters count double", () => {
    // 41 emoji is 82 code units and trips an 80-unit limit. Worth knowing
    // rather than discovering: the cut-off is not where it looks.
    expect(splitWordAndDefinition(`${"😀".repeat(41)}: def`)).toBeNull();
  });
});
