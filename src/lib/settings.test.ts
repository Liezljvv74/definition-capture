import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ upserts: [] as Record<string, unknown>[] }));

vi.mock("@/lib/supabaseClient", () => ({
  getSupabase: () => ({
    from: () => ({
      upsert: async (row: Record<string, unknown>) => {
        state.upserts.push(row);
        return { error: null };
      },
    }),
  }),
}));
vi.mock("@/lib/session", () => ({
  currentUserId: () => "user-1",
  subscribe: () => () => {},
}));

import { fromRow, parseSettings, saveSettings, currentSettings } from "@/lib/settings";

const row = (over: Record<string, unknown>) => fromRow({ ...over }, [], [], []);
const file = (over: Record<string, unknown>) =>
  parseSettings({ displayName: "", collections: ["A"], sources: ["B"], ...over });

describe("native language and level", () => {
  it("reads them from a row, and an unknown level as not set", () => {
    const s = row({ native_language: "de", level: "B2" });
    expect([s.nativeLanguage, s.nativeLanguageOther, s.level]).toEqual(["de", "", "B2"]);
    expect(row({ level: "D1" }).level).toBe("");
    expect(row({ level: 3 }).level).toBe("");
  });

  it("lets a code win over a typed name, and keeps a typed name alone", () => {
    const both = row({ native_language: "de", native_language_other: "Klingon" });
    expect([both.nativeLanguage, both.nativeLanguageOther]).toEqual(["de", ""]);
    const typed = row({ native_language: "", native_language_other: " Klingon " });
    expect([typed.nativeLanguage, typed.nativeLanguageOther]).toEqual(["", "Klingon"]);
  });

  it("defaults to not set when there is no row", () => {
    const s = fromRow(null, [], [], []);
    expect([s.nativeLanguage, s.nativeLanguageOther, s.level]).toEqual(["", "", ""]);
  });

  it("writes the three columns on save", () => {
    saveSettings({ nativeLanguage: "fr", level: "C1" });
    expect(state.upserts.at(-1)).toMatchObject({
      native_language: "fr",
      native_language_other: "",
      level: "C1",
    });
    saveSettings({ nativeLanguage: "", nativeLanguageOther: "Welsh" });
    expect(state.upserts.at(-1)).toMatchObject({
      native_language: "",
      native_language_other: "Welsh",
      level: "C1",
    });
    expect(currentSettings().level).toBe("C1");
  });

  it("leaves current values alone when an old backup lacks the fields", () => {
    const s = file({});
    expect(s).not.toBeNull();
    expect(s?.nativeLanguage).toBeUndefined();
    expect(s?.nativeLanguageOther).toBeUndefined();
    expect(s?.level).toBeUndefined();
  });

  it("restores them from a new backup, reading untrusted values safely", () => {
    const s = file({ nativeLanguage: "es", nativeLanguageOther: "x", level: "A2" });
    expect([s?.nativeLanguage, s?.nativeLanguageOther, s?.level]).toEqual(["es", "", "A2"]);
    expect(file({ level: "Z9" })?.level).toBe("");
    expect(file({ nativeLanguage: "Spanish" })?.nativeLanguage).toBe("");
  });
});
