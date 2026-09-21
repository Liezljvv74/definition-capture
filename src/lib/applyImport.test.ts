import { beforeEach, describe, expect, it, vi } from "vitest";

import { applyImport, type BackupContents } from "@/lib/backup";
import type { Settings } from "@/lib/settings";
import { NO_IMPORT, type Entry, type ImportMode, type Phrase } from "@/lib/types";

/**
 * Restoring a backup is the one thing this app does that can destroy data, and
 * `applyImport` is the whole of the decision.
 *
 * `leavesListAlone` is tested next door as a predicate, but a predicate nobody
 * consults is worth nothing. This is its only caller, and until this file
 * existed the ternary that consults it could be inverted, or deleted outright,
 * with all 157 other tests still passing. What that mutation does is not
 * subtle: a words-only export restored with Replace would call the phrase and
 * verb-table importers with empty arrays, each of which reaches `replaceAll([])`
 * and deletes every row the reader owns in a list the file never mentioned.
 *
 * The importers are mocked, so this asserts the decision rather than the
 * writing. Whether `replaceAll([])` really empties a list belongs to the store's
 * own tests; what belongs here is that this function never asks it to.
 */

const spies = vi.hoisted(() => {
  /** Every call in order, so "settings first" can be asserted rather than assumed. */
  const order: string[] = [];
  const importer = (name: string) =>
    vi.fn((items: unknown[], mode: string) => {
      order.push(`${name} (${mode})`);
      return { added: items.length, updated: 0, skipped: 0 };
    });

  return {
    order,
    importEntries: importer("words"),
    importPhrases: importer("phrases"),
    importVerbTables: importer("verbTables"),
    saveSettings: vi.fn(() => {
      order.push("settings");
    }),
  };
});

vi.mock("@/lib/storage", () => ({
  getEntries: () => [],
  parseEntryList: () => ({ entries: [], unreadable: 0 }),
  importEntries: spies.importEntries,
}));
vi.mock("@/lib/phraseStorage", () => ({
  getPhrases: () => [],
  parsePhraseList: () => ({ phrases: [], unreadable: 0 }),
  importPhrases: spies.importPhrases,
}));
vi.mock("@/lib/verbTables", () => ({
  getVerbTables: () => [],
  parseVerbTableList: () => ({ tables: [], unreadable: 0 }),
  importVerbTables: spies.importVerbTables,
}));
vi.mock("@/lib/settings", () => ({
  currentSettings: () => null,
  parseSettings: () => null,
  saveSettings: spies.saveSettings,
}));

const word = (text: string): Entry => ({
  id: crypto.randomUUID(),
  word: text,
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
  ref: "",
});

const settings: Settings = {
  displayName: "",
  categories: ["Food"],
  sources: ["Manual"],
  verbPersons: [],
  verbTenses: [],
};

const contents = (over: Partial<BackupContents> = {}): BackupContents => ({
  words: [],
  phrases: [],
  verbTables: [],
  settings: null,
  unreadable: 0,
  ...over,
});

beforeEach(() => {
  spies.order.length = 0;
  spies.importEntries.mockClear();
  spies.importPhrases.mockClear();
  spies.importVerbTables.mockClear();
  spies.saveSettings.mockClear();
});

describe("Replace only reaches the lists the file carries", () => {
  it("never touches the other two when the file holds words only", () => {
    // The shape of a scoped export, and the one this app is most likely to be
    // handed: Export -> Words -> JSON, restored months later with Replace.
    const result = applyImport(contents({ words: [word("Tür")] }), "replace");

    expect(spies.importEntries).toHaveBeenCalledTimes(1);
    expect(spies.importEntries.mock.calls[0][1]).toBe("replace");
    expect(spies.importPhrases).not.toHaveBeenCalled();
    expect(spies.importVerbTables).not.toHaveBeenCalled();

    // And it must say so, rather than reporting a delete it did not do.
    expect(result.phrases).toEqual(NO_IMPORT);
    expect(result.verbTables).toEqual(NO_IMPORT);
    expect(result.words.added).toBe(1);
  });

  it("does touch a list the file does carry, even alongside an empty one", () => {
    applyImport(
      contents({ words: [word("Tür")], phrases: [phrase("guten Tag")] }),
      "replace",
    );

    expect(spies.importEntries).toHaveBeenCalledTimes(1);
    expect(spies.importPhrases).toHaveBeenCalledTimes(1);
    expect(spies.importVerbTables).not.toHaveBeenCalled();
  });

  it("touches nothing at all when the file carries no lists", () => {
    const result = applyImport(contents(), "replace");

    expect(spies.importEntries).not.toHaveBeenCalled();
    expect(spies.importPhrases).not.toHaveBeenCalled();
    expect(spies.importVerbTables).not.toHaveBeenCalled();
    expect(result.words).toEqual(NO_IMPORT);
  });
});

describe("the merge modes", () => {
  /**
   * "Leaves alone" is a Replace concept. Skip and update never delete, so
   * passing them an empty list is harmless, and skipping the call would only
   * make the counts wrong in a way nobody could see.
   */
  for (const mode of ["skip", "update"] as const) {
    it(`import every list in ${mode} mode, empty or not`, () => {
      applyImport(contents({ words: [word("Tür")] }), mode);

      expect(spies.importEntries).toHaveBeenCalledTimes(1);
      expect(spies.importPhrases).toHaveBeenCalledTimes(1);
      expect(spies.importVerbTables).toHaveBeenCalledTimes(1);
    });
  }

  it("pass the mode straight through to every importer", () => {
    const mode: ImportMode = "update";
    applyImport(contents({ words: [word("Tür")] }), mode);

    for (const spy of [spies.importEntries, spies.importPhrases, spies.importVerbTables]) {
      expect(spy.mock.calls[0][1]).toBe(mode);
    }
  });
});

describe("settings", () => {
  it("are written before any list, so a restored category exists for the rows using it", () => {
    applyImport(contents({ words: [word("Tür")], settings }), "replace");

    expect(spies.saveSettings).toHaveBeenCalledWith(settings);
    expect(spies.order[0]).toBe("settings");
  });

  it("are left alone in skip mode, which has nothing to mean for one row", () => {
    const result = applyImport(contents({ words: [word("Tür")], settings }), "skip");

    expect(spies.saveSettings).not.toHaveBeenCalled();
    expect(result.settingsRestored).toBe(false);
  });

  it("are left alone when the file carries none, even in replace", () => {
    const result = applyImport(contents({ words: [word("Tür")] }), "replace");

    expect(spies.saveSettings).not.toHaveBeenCalled();
    expect(result.settingsRestored).toBe(false);
  });
});
