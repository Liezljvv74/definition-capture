import { describe, expect, it } from "vitest";

import {
  leavesListAlone,
  parseBackup,
  restoresSettings,
  type BackupContents,
} from "@/lib/backup";
import type { Entry, Phrase } from "@/lib/types";

const ok = (text: string) => {
  const parsed = parseBackup(text);
  if (!parsed.ok) throw new Error(`expected a readable backup, got: ${parsed.error}`);
  return parsed;
};

const contents = (over: Partial<BackupContents> = {}): BackupContents => ({
  words: [],
  phrases: [],
  verbTables: [],
  settings: null,
  unreadable: 0,
  ...over,
});

const entry = (word: string): Entry => ({
  id: crypto.randomUUID(),
  word,
  definition: "d",
  ref: "",
  categories: [],
  source: "Manual",
  dateAdded: "2026-01-01T00:00:00.000Z",
  dateUpdated: null,
  needsDefinition: false,
});

const phrase = (text: string): Phrase => ({
  id: crypto.randomUUID(),
  phrase: text,
  literalMeaning: "",
  usageExample: "",
  categories: [],
  source: "Manual",
  dateAdded: "2026-01-01T00:00:00.000Z",
  ref: "",
});

describe("parseBackup — rejects", () => {
  it("anything that is not JSON", () => {
    expect(parseBackup("not json").ok).toBe(false);
    expect(parseBackup("").ok).toBe(false);
  });

  it("JSON with no list in it at all", () => {
    for (const text of ["null", "42", '"a"', "{}", '{"other":[]}']) {
      expect(parseBackup(text).ok).toBe(false);
    }
  });

  it("a file whose lists are present but hold nothing readable", () => {
    expect(parseBackup('{"entries":[],"phrases":[],"verbTables":[]}').ok).toBe(false);
    expect(parseBackup('{"entries":[null,42,{}]}').ok).toBe(false);
  });
});

describe("parseBackup — reads", () => {
  it("a bare array as a list of words", () => {
    // What a hand-written file or a very early export looks like.
    const parsed = ok(JSON.stringify([entry("Tür")]));
    expect(parsed.words.map((e) => e.word)).toEqual(["Tür"]);
    expect(parsed.phrases).toEqual([]);
    expect(parsed.verbTables).toEqual([]);
  });

  it("counts rows it could not read rather than failing on them", () => {
    const parsed = ok(JSON.stringify({ entries: [entry("Tür"), null, 42, {}] }));
    expect(parsed.words).toHaveLength(1);
    expect(parsed.unreadable).toBe(3);
  });

  it("a version 2 file, leaving verb tables and settings absent", () => {
    // Absent is not the same as empty — see the Replace tests below.
    const parsed = ok(
      JSON.stringify({ version: 2, entries: [entry("Tür")], phrases: [] }),
    );
    expect(parsed.verbTables).toEqual([]);
    expect(parsed.settings).toBeNull();
  });

  it("a version 3 file, with tables and settings", () => {
    const parsed = ok(
      JSON.stringify({
        version: 3,
        entries: [entry("gehen")],
        verbTables: [
          {
            id: crypto.randomUUID(),
            verb: "gehen",
            tenses: ["Present"],
            rows: [{ person: "ich", conjugations: ["gehe"], notes: "" }],
          },
        ],
        settings: { categories: ["Grammar"], sources: ["Textbook"] },
      }),
    );
    expect(parsed.verbTables).toHaveLength(1);
    expect(parsed.verbTables[0].rows[0].conjugations).toEqual(["gehe"]);
    expect(parsed.settings?.categories).toEqual(["Grammar"]);
  });

  it("holds the conjugation invariant for a hand-edited table", () => {
    // Two headings, one cell in the file: the reader pads it, because the
    // database cannot enforce this and everything downstream assumes it.
    const parsed = ok(
      JSON.stringify({
        verbTables: [
          {
            id: crypto.randomUUID(),
            verb: "gehen",
            tenses: ["Present", "Past"],
            rows: [{ person: "ich", conjugations: ["gehe"] }],
          },
        ],
      }),
    );
    expect(parsed.verbTables[0].rows[0].conjugations).toEqual(["gehe", ""]);
  });

  it("survives a round trip through JSON with accented and non-Latin text", () => {
    const original = { id: crypto.randomUUID(), word: "Tür", definition: "ある 🇩🇪" };
    const parsed = ok(JSON.stringify({ words: [original] }));
    expect(parsed.words[0].word).toBe("Tür");
    expect(parsed.words[0].definition).toBe("ある 🇩🇪");
  });

  /**
   * Version 5 and earlier called the list `entries` and its name field `term`.
   * Every backup anyone already holds is one of those, so both spellings are
   * read. This is the test that stops a later tidy-up from quietly making
   * those files unreadable.
   */
  it("reads a pre-version-6 file, which called them entries and terms", () => {
    const parsed = ok(
      JSON.stringify({
        version: 5,
        entries: [{ id: crypto.randomUUID(), term: "Tür", definition: "door" }],
      }),
    );
    expect(parsed.words.map((w) => w.word)).toEqual(["Tür"]);
    expect(parsed.words[0].definition).toBe("door");
  });
});

/**
 * Replace deletes before it writes, so what it declines to touch is the most
 * consequential thing in this module. A list the file says nothing about must
 * survive — otherwise restoring a terms-only export, or a backup written
 * before conjugation tables existed, silently destroys everything else.
 */
describe("Replace only touches the lists the file carries", () => {
  it("leaves every other list alone when the file has words only", () => {
    const only = contents({ words: [entry("Tür")] });
    expect(leavesListAlone(only, "words", "replace")).toBe(false);
    expect(leavesListAlone(only, "phrases", "replace")).toBe(true);
    expect(leavesListAlone(only, "verbTables", "replace")).toBe(true);
    expect(restoresSettings(only, "replace")).toBe(false);
  });

  it("wipes a list the file does carry", () => {
    const both = contents({
      words: [entry("Tür")],
      phrases: [phrase("guten Tag")],
    });
    expect(leavesListAlone(both, "words", "replace")).toBe(false);
    expect(leavesListAlone(both, "phrases", "replace")).toBe(false);
  });

  it("never counts as leaving anything alone in the merge modes", () => {
    // "Leaves alone" is a Replace concept; skip and update never delete.
    const empty = contents();
    for (const mode of ["skip", "update"] as const) {
      expect(leavesListAlone(empty, "words", mode)).toBe(false);
      expect(leavesListAlone(empty, "phrases", mode)).toBe(false);
      expect(leavesListAlone(empty, "verbTables", mode)).toBe(false);
    }
  });
});

describe("restoresSettings", () => {
  const withSettings = contents({
    settings: {
      displayName: "",
      categories: ["Grammar"],
      sources: ["Manual"],
      verbPersons: [],
      verbTenses: [],
      answerSeparators: ",/",
    },
  });

  it("leaves settings alone in skip mode, which has nothing to mean for one row", () => {
    expect(restoresSettings(withSettings, "skip")).toBe(false);
  });

  it("restores them in the modes that are willing to overwrite", () => {
    expect(restoresSettings(withSettings, "update")).toBe(true);
    expect(restoresSettings(withSettings, "replace")).toBe(true);
  });

  it("restores nothing when the file carries no settings", () => {
    expect(restoresSettings(contents(), "replace")).toBe(false);
  });
});
