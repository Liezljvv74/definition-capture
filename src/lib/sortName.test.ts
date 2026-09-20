import { describe, expect, it } from "vitest";

import { compareNames, compareText } from "@/lib/sortName";

/** Ascending order, the way the list pages use these comparators. */
const sorted = (names: string[], by = compareNames) => [...names].sort(by);

describe("compareNames", () => {
  it("files a German noun under its own letter, not its article", () => {
    // The reason this module exists: sorting the raw strings piles most of a
    // German list under D.
    expect(sorted(["die Tür", "der Apfel", "das Buch"])).toEqual([
      "der Apfel",
      "das Buch",
      "die Tür",
    ]);
  });

  it("only skips an article with a word behind it", () => {
    // `Dienstag` starts with "die" as letters, not as an article. The `\s+`
    // in the pattern is what keeps it filed under D.
    expect(compareNames("Dienstag", "Apfel")).toBeGreaterThan(0);
    expect(compareNames("Dienstag", "Zebra")).toBeLessThan(0);
  });

  it("keeps a bare article whole, since there is nothing behind it to sort on", () => {
    expect(compareNames("der", "Apfel")).toBeGreaterThan(0);
    expect(compareNames("der", "Zebra")).toBeLessThan(0);
  });

  it("skips the article whatever its case, and however much space follows", () => {
    expect(compareNames("DIE Tür", "die Tür")).toBe(0);
    expect(compareNames("die  Tür", "die Tür")).toBe(0);
  });

  it("strips only one article", () => {
    // "die Katze" is what is left, and it sorts under K — not under D, and
    // not under whatever a second strip would leave.
    expect(sorted(["die die Katze", "Apfel", "Zebra"])).toEqual([
      "Apfel",
      "die die Katze",
      "Zebra",
    ]);
  });
});

describe("compareText", () => {
  it("files an umlaut with its base letter rather than after Z", () => {
    expect(sorted(["Zebra", "Über", "Apfel"], compareText)).toEqual([
      "Apfel",
      "Über",
      "Zebra",
    ]);
  });

  it("ignores case and accents, which makes some different words tie", () => {
    // `sensitivity: "base"` is deliberate for ordering, and the consequence
    // is that these compare equal. The list pages break the tie on date, so
    // the order stays stable — but nothing here should "fix" this into a
    // distinction, because that would file Über after Z again.
    expect(compareText("Tur", "Tür")).toBe(0);
    expect(compareText("tur", "TUR")).toBe(0);
  });

  it("sorts ß with ss, which is the German rule and not the default one", () => {
    // This is the assertion that would fail if the collator lost its pinned
    // locale and fell back to the machine's. On `en` these do not tie.
    expect(compareText("Straße", "Strasse")).toBe(0);
  });

  it("ignores surrounding whitespace", () => {
    expect(compareText("  Apfel  ", "Apfel")).toBe(0);
  });

  it("puts an empty value first in ascending order", () => {
    // A term with no definition sorts to the top of the Definition column,
    // which is where someone filling in the gaps would look for it.
    expect(compareText("", "Apfel")).toBeLessThan(0);
  });
});
