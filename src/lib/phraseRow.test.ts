import { describe, expect, it } from "vitest";

import { fromPhraseRow, toPhraseRow } from "@/lib/phraseStorage";
import type { Phrase } from "@/lib/types";

/**
 * The phrase list reads and writes through a view, not through its own table,
 * and the column names differ from the field names on both sides. Nothing here
 * fails loudly when it drifts: a field read from a column the view does not
 * have is simply empty, and a field written to one it does not accept is
 * simply dropped. The screen goes on looking fine until somebody asks for the
 * value that quietly stopped travelling.
 *
 * `created_at` is the one that prompted this file. It reaches the reader as
 * Date added on the phrase's own page, and it is the column the list is
 * ordered by, so losing it costs both.
 */
const phrase: Phrase = {
  id: "7f3b1c88-0c4e-4f4a-9a2b-0c2b3f9f5a11",
  phrase: "guten Tag",
  literalMeaning: "good day",
  usageExample: "Guten Tag, Frau Müller.",
  categories: ["People"],
  source: "Textbook",
  ref: "see [[der Mann]]",
  dateAdded: "2026-02-03T09:15:00.000Z",
};

const row = {
  id: phrase.id,
  phrase: "guten Tag",
  literal_meaning: "good day",
  usage_example: "Guten Tag, Frau Müller.",
  categories: ["People"],
  source: "Textbook",
  ref: "see [[der Mann]]",
  created_at: "2026-02-03T09:15:00.000Z",
};

describe("fromPhraseRow", () => {
  it("reads every field the view offers", () => {
    expect(fromPhraseRow(row)).toEqual(phrase);
  });

  it("takes the capture date from created_at", () => {
    expect(fromPhraseRow(row)?.dateAdded).toBe("2026-02-03T09:15:00.000Z");
  });

  it("refuses a row with no id or no text", () => {
    expect(fromPhraseRow({ ...row, id: "" })).toBeNull();
    expect(fromPhraseRow({ ...row, phrase: "   " })).toBeNull();
  });
});

describe("toPhraseRow", () => {
  it("writes every field back under the view's column names", () => {
    expect(toPhraseRow(phrase)).toEqual(row);
  });

  it("survives a round trip through the row shape", () => {
    expect(fromPhraseRow(toPhraseRow(phrase))).toEqual(phrase);
  });
});
