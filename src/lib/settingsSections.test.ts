import { describe, expect, it } from "vitest";

import { SETTINGS_SECTIONS, readSection, readSectionKey } from "@/lib/settingsSections";

/**
 * Which group of settings is showing comes out of the URL, so it can be
 * anything at all: a typo, an old link, a section that was renamed. A page
 * that renders nothing for an unrecognised value is indistinguishable from one
 * that is broken, which is why there is a fallback rather than an empty frame.
 */
describe("readSection", () => {
  it("finds each section by its key", () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(readSection(section.key)).toBe(section);
    }
  });

  it("falls back to the first section for anything it does not know", () => {
    for (const value of [null, "", "nonsense", "Profile", "flashcard"]) {
      expect(readSection(value)).toBe(SETTINGS_SECTIONS[0]);
    }
  });

  it("agrees with readSectionKey, which is the same lookup", () => {
    for (const value of [null, "glossary", "nope"]) {
      expect(readSectionKey(value)).toBe(readSection(value).key);
    }
  });

  it("offers the three groups the gear menu offers", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.key)).toEqual([
      "profile",
      "glossary",
      "flashcards",
    ]);
  });
});
