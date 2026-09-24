import { describe, expect, it } from "vitest";

import { BACKUP_FORMAT, BACKUP_VERSION, buildBackup, parseBackup } from "@/lib/backup";
import { DEFAULT_ANSWER_SEPARATORS } from "@/lib/constants";
import { toWirePhrase } from "@/lib/phraseStorage";
import { toWireWord } from "@/lib/storage";
import type { Entry, Phrase, VerbTable } from "@/lib/types";
import { toWireVerbTable } from "@/lib/verbTables";

/**
 * An export has to be readable by this app's own Import, and until now nothing
 * said so: `buildBackup` was imported by no test at all.
 *
 * That gap is what let the write side drift. There was no writer to speak of —
 * the domain objects went straight to `JSON.stringify` — so renaming a field
 * changed the file format with nothing to notice, and the reader was patched
 * afterwards to cope. These tests put the two halves in the same room.
 */

const entry: Entry = {
  id: crypto.randomUUID(),
  word: "Tür",
  definition: "door",
  ref: "see [[Tor]]",
  categories: ["Home", "Travel"],
  source: "Manual",
  dateAdded: "2026-01-01T00:00:00.000Z",
  dateUpdated: "2026-02-02T00:00:00.000Z",
  needsDefinition: false,
};

const phrase: Phrase = {
  id: crypto.randomUUID(),
  phrase: "guten Tag",
  literalMeaning: "good day",
  usageExample: "Guten Tag, Frau Müller.",
  categories: ["People"],
  source: "Textbook",
  ref: "",
  dateAdded: "2026-02-03T09:15:00.000Z",
};

const table: VerbTable = {
  id: crypto.randomUUID(),
  verb: "gehen",
  tenses: ["Present", "Past"],
  rows: [
    { person: "ich", conjugations: ["gehe", "ging"], notes: "regular enough" },
    { person: "du", conjugations: ["gehst", "gingst"], notes: "" },
  ],
  createdAt: "2026-01-03T00:00:00.000Z",
};

/** A file of exactly the shape `buildBackup` writes, from known rows. */
const fileHolding = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: "2026-03-01T00:00:00.000Z",
    words: [toWireWord(entry)],
    phrases: [toWirePhrase(phrase)],
    verbTables: [toWireVerbTable(table)],
    settings: null,
    ...over,
  });

const read = (text: string) => {
  const parsed = parseBackup(text);
  if (!parsed.ok) throw new Error(`expected a readable backup, got: ${parsed.error}`);
  return parsed;
};

describe("what the writer writes, the reader reads", () => {
  it("returns every word field for field", () => {
    // `needsDefinition` included: the file does not carry it, and the reader
    // is expected to work it out again rather than default it.
    expect(read(fileHolding()).words).toEqual([entry]);
  });

  it("returns every phrase field for field", () => {
    expect(read(fileHolding()).phrases).toEqual([phrase]);
  });

  it("stands in a date for a phrase written before phrases had one", () => {
    // Every file up to version 7 is this shape, and there are such files in
    // people's Downloads folders. The phrase has to come back, and it has to
    // come back with a usable date rather than a blank that would sit on its
    // page forever.
    const beforeVersion8: Record<string, unknown> = { ...toWirePhrase(phrase) };
    delete beforeVersion8.dateAdded;
    const restored = read(fileHolding({ phrases: [beforeVersion8 as never] })).phrases[0];

    expect(restored.phrase).toBe(phrase.phrase);
    expect(Number.isNaN(Date.parse(restored.dateAdded))).toBe(false);
  });

  it("keeps the default separators when a file predates the setting", () => {
    /*
     * The same shape of hazard as the phrase date above, and a worse
     * consequence. `readSeparators` answers an unreadable value with "", and
     * "" is also what a reader means when they turn every separator off, so a
     * settings block written before this field existed is indistinguishable
     * from a deliberate choice unless the absence of the key is handled on its
     * own. Restoring one used to switch the marking rule off: "gladly" would
     * be refused for "gladly, willingly" from then on, with nothing on screen
     * to connect the two.
     */
    const olderSettings = {
      displayName: "Reader",
      categories: ["Home"],
      sources: ["Manual"],
      verbPersons: ["ich"],
      verbTenses: ["Present"],
    };

    const restored = read(fileHolding({ settings: olderSettings })).settings;
    expect(restored?.answerSeparators).toBe(DEFAULT_ANSWER_SEPARATORS);
  });

  it("takes an empty separator string in a current file at its word", () => {
    // Present and empty is a reader who turned them all off, which the
    // fallback above must not overrule.
    const restored = read(
      fileHolding({
        settings: {
          displayName: "",
          categories: ["Home"],
          sources: ["Manual"],
          verbPersons: [],
          verbTenses: [],
          answerSeparators: "",
        },
      }),
    ).settings;
    expect(restored?.answerSeparators).toBe("");
  });

  it("leaves the reader's language alone when a file predates the setting", () => {
    /*
     * Undefined, not "" and []. `saveSettings` keeps whatever is set for a
     * field left undefined, and clears it for "". Restoring a file from
     * before languages existed must not wipe out a language chosen since,
     * and "" here would do exactly that, with the lists quietly reverting to
     * the neutral order.
     */
    const olderSettings = {
      displayName: "",
      categories: ["Home"],
      sources: ["Manual"],
      verbPersons: [],
      verbTenses: [],
      answerSeparators: ",/",
    };

    const restored = read(fileHolding({ settings: olderSettings })).settings;
    expect(restored).not.toBeNull();
    expect(restored?.language).toBeUndefined();
    expect(restored?.languageOther).toBeUndefined();
    expect(restored?.sortSkipWords).toBeUndefined();
  });

  it("restores a language and its words from a current file", () => {
    const restored = read(
      fileHolding({
        settings: {
          displayName: "",
          categories: ["Home"],
          sources: ["Manual"],
          verbPersons: [],
          verbTenses: [],
          answerSeparators: ",/",
          language: "fr",
          languageOther: "",
          sortSkipWords: ["le", "la", "l'"],
        },
      }),
    ).settings;
    expect(restored?.language).toBe("fr");
    expect(restored?.languageOther).toBe("");
    expect(restored?.sortSkipWords).toEqual(["le", "la", "l'"]);
  });

  it("reads a typed-in language only when no code is chosen", () => {
    // The two are one answer. A file holding both keeps the code, which is
    // the one the menu offered, as the database's check would insist.
    const both = read(
      fileHolding({
        settings: { language: "fr", languageOther: "Klingon", sortSkipWords: [] },
      }),
    ).settings;
    expect(both?.language).toBe("fr");
    expect(both?.languageOther).toBe("");

    const typed = read(
      fileHolding({ settings: { language: "", languageOther: " Klingon ", sortSkipWords: [] } }),
    ).settings;
    expect(typed?.language).toBe("");
    expect(typed?.languageOther).toBe("Klingon");
  });

  it("reads an unusable language code as none chosen", () => {
    const restored = read(
      fileHolding({ settings: { language: "French", languageOther: "", sortSkipWords: [] } }),
    ).settings;
    expect(restored?.language).toBe("");
  });

  it("returns a conjugation table with its grid intact", () => {
    const [restored] = read(fileHolding()).verbTables;
    expect(restored).toEqual(table);
    // The invariant the whole verb store is built on, across a round trip.
    for (const row of restored.rows) {
      expect(row.conjugations).toHaveLength(restored.tenses.length);
    }
  });

  it("survives accented and non-Latin text", () => {
    const text = fileHolding({
      words: [toWireWord({ ...entry, word: "Tür", definition: "ある 🇩🇪" })],
    });
    expect(read(text).words[0].word).toBe("Tür");
    expect(read(text).words[0].definition).toBe("ある 🇩🇪");
  });
});

describe("the file the writer produces", () => {
  it("names its list `words`, which is what the reader looks for first", () => {
    const written = JSON.parse(fileHolding()) as Record<string, unknown>;
    expect(Object.keys(written)).toContain("words");
    expect(Object.keys(written)).not.toContain("entries");
  });

  it("leaves out the one field that is derived rather than stored", () => {
    // `needsDefinition` comes from `definition`. Writing it made every backup
    // bigger and invited a later reader to trust it over the text itself.
    expect(Object.keys(toWireWord(entry))).not.toContain("needsDefinition");
  });

  it("carries no field the wire type does not declare", () => {
    // The point of having a writer: a field added to `Entry` for the screen's
    // benefit does not silently start appearing in everyone's backups.
    expect(Object.keys(toWireWord(entry)).sort()).toEqual([
      "categories",
      "dateAdded",
      "dateUpdated",
      "definition",
      "id",
      "ref",
      "source",
      "word",
    ]);
  });
});

describe("buildBackup", () => {
  it("stamps the format and the version it was written by", () => {
    const backup = buildBackup();
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(Date.parse(backup.exportedAt)).not.toBeNaN();
  });

  it("carries settings only in a full export, since a scope has no room for them", () => {
    expect(buildBackup("all").settings).not.toBeNull();
    for (const scope of ["words", "phrases", "verbTables"] as const) {
      expect(buildBackup(scope).settings).toBeNull();
    }
  });

  it("leaves the other lists empty in a scoped export", () => {
    // Nothing is signed in under test, so every list is empty either way; what
    // is asserted here is the shape, which is what Import reads to decide
    // whether Replace may touch a list.
    const scoped = buildBackup("words");
    expect(scoped.phrases).toEqual([]);
    expect(scoped.verbTables).toEqual([]);
  });
});
