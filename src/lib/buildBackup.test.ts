import { describe, expect, it, vi } from "vitest";

import { buildBackup } from "@/lib/backup";
import { createPhrase } from "@/lib/phraseStorage";
import { createRule } from "@/lib/rules";
import { createEntry } from "@/lib/storage";
import { EMPTY_ENTRY_INPUT, EMPTY_PHRASE_INPUT } from "@/lib/types";
import { createVerbTable } from "@/lib/verbTables";

/**
 * What `buildBackup` actually writes, with rows in the stores.
 *
 * Its round-trip neighbour proves the codecs agree with the reader, but it
 * builds the file by hand. This one seeds the real stores and reads what comes
 * out, which is the only way to notice `buildBackup` handing the domain
 * objects over without mapping them — the exact drift that let the `term` to
 * `word` rename change the file format silently.
 *
 * No Supabase and a fake session, so the stores keep their rows in memory and
 * the writes go nowhere.
 */
vi.mock("@/lib/supabaseClient", () => ({ getSupabase: () => null }));
vi.mock("@/lib/session", () => ({
  currentUserId: () => "user-1",
  subscribe: () => () => {},
}));

const saved = (() => {
  const entry = createEntry({
    ...EMPTY_ENTRY_INPUT,
    word: "Tür",
    definition: "door",
    collections: ["Home"],
  });
  const phrase = createPhrase({
    ...EMPTY_PHRASE_INPUT,
    phrase: "guten Tag",
    literalMeaning: "good day",
  });
  const table = createVerbTable("gehen", ["ich", "du"], "Present");
  const rule = createRule({ title: "Dative", topic: "Cases" });
  return { entry, phrase, table, rule };
})();

describe("buildBackup, with something to back up", () => {
  it("writes each list through its own codec, not the domain object", () => {
    const backup = buildBackup();

    expect(backup.words).toHaveLength(1);
    expect(backup.phrases).toHaveLength(1);
    expect(backup.verbTables).toHaveLength(1);
    expect(backup.rules).toHaveLength(1);

    // The store holds a `needsDefinition` on every entry. The file must not,
    // because it is derived and the reader works it out again.
    expect(saved.entry).toHaveProperty("needsDefinition");
    expect(backup.words[0]).not.toHaveProperty("needsDefinition");
    expect(backup.words[0]).toEqual({
      id: saved.entry.id,
      word: "Tür",
      definition: "door",
      ref: "",
      collections: ["Home"],
      source: saved.entry.source,
      dateAdded: saved.entry.dateAdded,
      dateUpdated: null,
    });
  });

  it("writes the phrase and the table the reader will get back", () => {
    const backup = buildBackup();

    expect(backup.phrases[0]).toEqual({
      id: saved.phrase.id,
      phrase: "guten Tag",
      literalMeaning: "good day",
      usageExample: "",
      collections: [],
      source: saved.phrase.source,
      ref: "",
      dateAdded: saved.phrase.dateAdded,
    });
    expect(backup.verbTables[0]).toEqual({
      id: saved.table.id,
      verb: "gehen",
      tenses: ["Present"],
      rows: [
        { person: "ich", conjugations: [""], notes: "" },
        { person: "du", conjugations: [""], notes: "" },
      ],
      createdAt: saved.table.createdAt,
    });
  });

  it("writes the rule the reader will get back", () => {
    const backup = buildBackup();

    expect(backup.rules[0]).toEqual({
      id: saved.rule.id,
      title: "Dative",
      topic: "Cases",
      blocks: [],
      dateAdded: saved.rule.dateAdded,
      dateUpdated: null,
    });
  });

  it("carries only the list a scoped export names", () => {
    // This is what Import reads to decide whether Replace may touch a list, so
    // a scope that leaked another list would turn a safe restore destructive.
    const words = buildBackup("words");
    expect(words.words).toHaveLength(1);
    expect(words.phrases).toEqual([]);
    expect(words.verbTables).toEqual([]);
    expect(words.rules).toEqual([]);

    const tables = buildBackup("verbTables");
    expect(tables.verbTables).toHaveLength(1);
    expect(tables.words).toEqual([]);
    expect(tables.phrases).toEqual([]);
    expect(tables.rules).toEqual([]);

    const rules = buildBackup("rules");
    expect(rules.rules).toHaveLength(1);
    expect(rules.words).toEqual([]);
    expect(rules.phrases).toEqual([]);
    expect(rules.verbTables).toEqual([]);
  });
});
