import { describe, expect, it } from "vitest";

import { foldName } from "@/lib/foldName";

/**
 * `foldName` is the single definition of "same name" in this app, so these
 * tests are really about one property: two spellings a reader would call the
 * same word must fold to the same string, and two they would call different
 * must not. Everything that matches names — the duplicate checks, `[[Name]]`
 * links, autocomplete, the import matchers — inherits whatever is asserted
 * here.
 */
describe("foldName", () => {
  it("ignores case", () => {
    expect(foldName("Tür")).toBe(foldName("tür"));
    expect(foldName("DER TISCH")).toBe(foldName("der tisch"));
  });

  it("ignores surrounding whitespace", () => {
    expect(foldName("  Tür  ")).toBe(foldName("Tür"));
    // JavaScript's \s covers the non-breaking space a paste can carry in.
    expect(foldName("Tür ")).toBe(foldName("Tür"));
  });

  it("treats a decomposed accent as the same name as a composed one", () => {
    // The bug this function exists for. "u" + combining diaeresis renders
    // identically to "ü" and is a different string; text pasted from a PDF or
    // typed on a Mac frequently arrives this way. Before folding, the term
    // was saved twice and neither copy could be linked to.
    const composed = "Tür"; // Tür
    const decomposed = "Tür"; // Tu + ̈ + r
    expect(composed).not.toBe(decomposed);
    expect(foldName(composed)).toBe(foldName(decomposed));
  });

  it("always returns composed form, whichever way it was given", () => {
    expect(foldName("Tür")).toBe("tür");
    expect(foldName("Tür")).toBe("tür");
  });

  it("keeps genuinely different words apart", () => {
    // `compareText` treats these as equal for *ordering* — accents are not a
    // sorting distinction — but they are different words and must never
    // collapse into one entry.
    expect(foldName("Tür")).not.toBe(foldName("Tur"));
    expect(foldName("schon")).not.toBe(foldName("schön"));
  });

  it("does not fold a dotted capital I to a dotless i", () => {
    // `toLocaleLowerCase` on a Turkish-locale machine lowercases "I" to "ı",
    // which would make that browser disagree with every other one about what
    // counts as a duplicate — over rows they share. The locale-independent
    // fold is the point.
    expect(foldName("ICH")).toBe("ich");
    expect(foldName("ICH")).not.toBe("ıch");
  });

  it("folds an empty or whitespace-only name to the empty string", () => {
    // Callers lean on this: `findByWord` and friends bail on a falsy needle
    // rather than matching the first entry with a blank name.
    expect(foldName("")).toBe("");
    expect(foldName("   ")).toBe("");
  });

  it("is idempotent", () => {
    // Keys are folded once when an index is built and again when it is
    // queried; folding a folded name must not move it.
    for (const name of ["Tür", "  DER Tisch ", "Tür", ""]) {
      expect(foldName(foldName(name))).toBe(foldName(name));
    }
  });
});
