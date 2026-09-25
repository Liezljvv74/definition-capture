import { describe, expect, it } from "vitest";

import { fromPhraseRow, toPhrasePayload } from "@/lib/phraseStorage";
import type { Phrase } from "@/lib/types";

/**
 * The phrase list reads rows of the shared `items` table and saves through
 * `save_items`, and the column names differ from the field names on both
 * sides. Nothing here fails loudly when it drifts: a field read from a column
 * the row does not have is simply empty, and a payload key the function does
 * not know is simply ignored. The screen goes on looking fine until somebody
 * asks for the value that quietly stopped travelling.
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
  collections: ["People"],
  source: "Textbook",
  ref: "see [[der Mann]]",
  dateAdded: "2026-02-03T09:15:00.000Z",
};

/** An `items` row as `remoteStore` hands it over, source and collections flattened. */
const row = {
  id: phrase.id,
  title: "guten Tag",
  literal_meaning: "good day",
  usage_example: "Guten Tag, Frau Müller.",
  collections: ["People"],
  source: "Textbook",
  ref: "see [[der Mann]]",
  created_at: "2026-02-03T09:15:00.000Z",
};

describe("fromPhraseRow", () => {
  it("reads every field the row offers", () => {
    expect(fromPhraseRow(row)).toEqual(phrase);
  });

  it("takes the capture date from created_at", () => {
    expect(fromPhraseRow(row)?.dateAdded).toBe("2026-02-03T09:15:00.000Z");
  });

  it("stands in a date for a row that somehow arrived without one", () => {
    // The column is `not null` with a default, so this is the impossible case.
    // It is asserted because the alternative is a phrase page showing a blank
    // Date added with nothing to explain it.
    const withoutDate: Record<string, unknown> = { ...row };
    delete withoutDate.created_at;
    expect(Number.isNaN(Date.parse(fromPhraseRow(withoutDate)?.dateAdded ?? ""))).toBe(false);
  });

  it("refuses a row with no id or no text", () => {
    expect(fromPhraseRow({ ...row, id: "" })).toBeNull();
    expect(fromPhraseRow({ ...row, title: "   " })).toBeNull();
  });
});

describe("toPhrasePayload", () => {
  it("writes every field under the names save_items reads", () => {
    expect(toPhrasePayload(phrase)).toEqual(row);
  });

  it("survives a round trip through the row shape", () => {
    expect(fromPhraseRow(toPhrasePayload(phrase))).toEqual(phrase);
  });

  it("reads a phrase with no source as the default, as it always has", () => {
    expect(fromPhraseRow({ ...row, source: "" })?.source).toBe("Manual");
  });
});
