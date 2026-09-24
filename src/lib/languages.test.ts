import { describe, expect, it } from "vitest";

import { MAX_LIST_LENGTH, MAX_SKIP_WORD } from "@/lib/constants";
import {
  LANGUAGE_PRESETS,
  MAX_LANGUAGE_NAME,
  canSortIn,
  languageMenu,
  presetFor,
  readLanguageCode,
  readLanguageName,
} from "@/lib/languages";
import { readSkipWords } from "@/lib/settings";

describe("the ready-made lists", () => {
  it("are all storable as they are", () => {
    // Choosing a language saves its list. A word the database's checks would
    // refuse would make that save fail, reload, and leave the reader looking
    // at an error for having picked from a menu.
    for (const preset of LANGUAGE_PRESETS) {
      expect(readLanguageCode(preset.code)).toBe(preset.code);
      expect(readSkipWords(preset.skipWords)).toEqual(preset.skipWords);
      expect(preset.skipWords.length).toBeLessThanOrEqual(MAX_LIST_LENGTH);
      for (const word of preset.skipWords) {
        expect(word.length).toBeLessThanOrEqual(MAX_SKIP_WORD);
      }
    }
  });

  it("cover each language once", () => {
    const codes = LANGUAGE_PRESETS.map((preset) => preset.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("are all languages the menu can sort in", () => {
    for (const preset of LANGUAGE_PRESETS) expect(canSortIn(preset.code)).toBe(true);
  });

  it("has nothing for a language without one", () => {
    expect(presetFor("cy")).toBeUndefined();
    expect(presetFor("")).toBeUndefined();
  });
});

describe("languageMenu", () => {
  it("lists the ready-made languages apart from the rest, without repeats", () => {
    const menu = languageMenu();
    expect(menu.presets).toHaveLength(LANGUAGE_PRESETS.length);
    const presetCodes = new Set(menu.presets.map((entry) => entry.code));
    expect(menu.others.some((entry) => presetCodes.has(entry.code))).toBe(false);
    expect(menu.others.length).toBeGreaterThan(0);
  });

  it("offers only languages this runtime can sort in", () => {
    for (const entry of languageMenu().others) expect(canSortIn(entry.code)).toBe(true);
  });
});

describe("reading a stored language", () => {
  it("takes a code and nothing shaped otherwise", () => {
    expect(readLanguageCode("fr")).toBe("fr");
    expect(readLanguageCode("French")).toBe("");
    expect(readLanguageCode("FR")).toBe("");
    expect(readLanguageCode(7)).toBe("");
  });

  it("trims a typed name, including after cutting it short", () => {
    // The database refuses a name that is not trimmed, and a cut at the
    // limit can land just after a space.
    const long = `${"a".repeat(MAX_LANGUAGE_NAME - 1)} b`;
    const read = readLanguageName(long);
    expect(read.length).toBeLessThanOrEqual(MAX_LANGUAGE_NAME);
    expect(read).toBe(read.trim());
    expect(readLanguageName("  Welsh ")).toBe("Welsh");
  });
});
