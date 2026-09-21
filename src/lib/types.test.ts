import { describe, expect, it } from "vitest";

import {
  MAX_TENSES,
  needsDefinition,
  readCategories,
  readNameList,
  readSource,
  readString,
  readTenses,
  readVerbRows,
} from "@/lib/types";

/**
 * These readers are the boundary between unknown JSON — a database row, a
 * backup file someone edited by hand — and everything downstream that treats
 * its input as already valid. Their contract is that they never throw and
 * always return something the app can render.
 */
describe("readString", () => {
  it("passes strings through and turns anything else into empty", () => {
    expect(readString("x")).toBe("x");
    for (const junk of [null, undefined, 42, {}, [], true]) {
      expect(readString(junk)).toBe("");
    }
  });
});

describe("readSource", () => {
  it("falls back to the default only when blank", () => {
    expect(readSource("Textbook")).toBe("Textbook");
    expect(readSource("")).toBe("Manual");
    expect(readSource("   ")).toBe("Manual");
    expect(readSource(null)).toBe("Manual");
    expect(readSource(42)).toBe("Manual");
  });

  it("keeps the spelling it was given", () => {
    // `sourceOrder` matches case-insensitively, so preserving case here is
    // safe and keeps the reader's own capitalisation on screen.
    expect(readSource("manual")).toBe("manual");
  });
});

describe("needsDefinition", () => {
  it("is true only for an empty or whitespace-only definition", () => {
    expect(needsDefinition("")).toBe(true);
    expect(needsDefinition("   ")).toBe(true);
    expect(needsDefinition("a door")).toBe(false);
  });
});

describe("readNameList", () => {
  it("trims, drops blanks, and caps", () => {
    expect(readNameList(["  a  ", "", "   ", "b"], 5)).toEqual(["a", "b"]);
    expect(readNameList(["a", "b", "c", "d"], 3)).toEqual(["a", "b", "c"]);
  });

  it("removes duplicates case- and accent-insensitively, first spelling winning", () => {
    expect(readNameList(["Food", "food", "FOOD"], 5)).toEqual(["Food"]);
    // Folded through `foldName`, so a decomposed accent is the same name.
    expect(readNameList(["Tür", "Tür"], 5)).toEqual(["Tür"]);
  });

  it("returns empty for anything that is not an array", () => {
    for (const junk of [null, undefined, "a,b", 42, {}]) {
      expect(readNameList(junk, 5)).toEqual([]);
    }
  });

  it("ignores non-string entries rather than failing on them", () => {
    expect(readNameList(["a", null, 42, {}, "b"], 5)).toEqual(["a", "b"]);
  });
});

describe("readCategories", () => {
  it("caps at three, which is the limit a word may carry", () => {
    expect(readCategories(["a", "b", "c", "d"])).toEqual(["a", "b", "c"]);
  });
});

describe("readTenses", () => {
  it("keeps blank names, unlike every other list reader here", () => {
    // Deliberate: a table made before tenses were asked for has one column
    // with no name, and dropping it would orphan that column's conjugations.
    // A `.filter(Boolean)` "tidy-up" here would silently shift every row.
    expect(readTenses([""])).toEqual([""]);
    expect(readTenses(["Present", "", "Past"])).toEqual(["Present", "", "Past"]);
  });

  it("trims and caps", () => {
    expect(readTenses(["  Present  "])).toEqual(["Present"]);
    expect(readTenses(Array(MAX_TENSES + 3).fill("x"))).toHaveLength(MAX_TENSES);
  });

  it("returns empty for a non-array", () => {
    expect(readTenses(null)).toEqual([]);
    expect(readTenses("Present")).toEqual([]);
  });
});

describe("readVerbRows", () => {
  /** The invariant the whole table depends on. */
  const widths = (rows: { conjugations: string[] }[]) =>
    rows.map((row) => row.conjugations.length);

  it("pads a short row out to the number of columns", () => {
    const rows = readVerbRows([{ person: "ich", conjugations: ["gehe"] }], 3);
    expect(widths(rows)).toEqual([3]);
    expect(rows[0].conjugations).toEqual(["gehe", "", ""]);
  });

  it("truncates a long row down to the number of columns", () => {
    const rows = readVerbRows([{ person: "ich", conjugations: ["a", "b", "c"] }], 1);
    expect(rows[0].conjugations).toEqual(["a"]);
  });

  it("holds the invariant whatever the row contained", () => {
    // The database cannot enforce "one conjugation per tense" — it is
    // repaired here, on every read, and everything downstream assumes it.
    const rows = readVerbRows(
      [
        { person: "ich", conjugations: [] },
        { person: "du", conjugations: "not an array" },
        { person: "er", conjugations: ["a", "b", "c", "d"] },
        { person: "wir" },
      ],
      2,
    );
    expect(widths(rows)).toEqual([2, 2, 2, 2]);
  });

  it("reads the pre-columns shape, where a row had one conjugation", () => {
    const rows = readVerbRows([{ person: "ich", conjugation: "gehe" }], 2);
    expect(rows[0].conjugations).toEqual(["gehe", ""]);
  });

  it("drops a row with no person, and survives junk entries", () => {
    const rows = readVerbRows(
      [{ person: "", conjugations: ["x"] }, null, 42, [], { person: "du" }],
      1,
    );
    expect(rows.map((row) => row.person)).toEqual(["du"]);
  });

  it("counts the row cap after blanks are dropped, not before", () => {
    // 5 unusable rows then 30 good ones still yields all 30 — the cap is
    // applied to what survives, which is not obvious from the loop.
    const junk = Array(5).fill({ person: "" });
    const good = Array(30).fill({ person: "ich", conjugations: ["x"] });
    expect(readVerbRows([...junk, ...good], 1)).toHaveLength(30);
  });

  it("stops at the row cap", () => {
    const many = Array(40).fill({ person: "ich", conjugations: ["x"] });
    expect(readVerbRows(many, 1)).toHaveLength(30);
  });

  it("returns empty for a non-array", () => {
    expect(readVerbRows(null, 2)).toEqual([]);
  });
});
