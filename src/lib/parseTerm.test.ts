import { describe, expect, it } from "vitest";

import { splitTermAndDefinition } from "@/lib/parseTerm";

describe("splitTermAndDefinition", () => {
  it("splits on a colon", () => {
    expect(splitTermAndDefinition("Tür: door")).toEqual({
      term: "Tür",
      definition: "door",
    });
  });

  it("splits on a spaced hyphen, en dash or em dash", () => {
    for (const dash of ["-", "–", "—"]) {
      expect(splitTermAndDefinition(`Tür ${dash} door`)).toEqual({
        term: "Tür",
        definition: "door",
      });
    }
  });

  it("leaves an unspaced dash alone, so compounds survive", () => {
    // `Tür-Rahmen` is one word, not a term and its definition.
    expect(splitTermAndDefinition("Tür-Rahmen")).toBeNull();
  });

  it("trims both halves", () => {
    expect(splitTermAndDefinition("  Tür  :  door  ")).toEqual({
      term: "Tür",
      definition: "door",
    });
  });

  it("splits on the leftmost separator, whichever kind it is", () => {
    expect(splitTermAndDefinition("Guten Tag - hallo: greeting")).toEqual({
      term: "Guten Tag",
      definition: "hallo: greeting",
    });
    expect(splitTermAndDefinition("Wort: a - b")).toEqual({
      term: "Wort",
      definition: "a - b",
    });
  });

  it("does not split a pasted URL on its scheme colon", () => {
    expect(splitTermAndDefinition("https://example.com")).toBeNull();
  });

  it("gives up on a URL even when a usable dash follows — a known limit", () => {
    // Only the leftmost separator is checked against `://`, so the perfectly
    // good dash split is never reached. Harmless (the paste is left alone)
    // but pinned, because the asymmetry is easy to "fix" into a regression.
    expect(splitTermAndDefinition("https://example.com - a site")).toBeNull();
  });

  it("returns null when either half is empty", () => {
    for (const input of ["", "   ", ":", ": def", "term:", "term:   "]) {
      expect(splitTermAndDefinition(input)).toBeNull();
    }
  });

  it("returns null when the term half is prose rather than a term", () => {
    const long = "x".repeat(81);
    expect(splitTermAndDefinition(`${long}: def`)).toBeNull();
    expect(splitTermAndDefinition(`${"x".repeat(80)}: def`)).toMatchObject({
      definition: "def",
    });
  });

  it("measures that length in UTF-16 units, so astral characters count double", () => {
    // 41 emoji is 82 code units and trips an 80-unit limit. Worth knowing
    // rather than discovering: the cut-off is not where it looks.
    expect(splitTermAndDefinition(`${"😀".repeat(41)}: def`)).toBeNull();
  });
});
