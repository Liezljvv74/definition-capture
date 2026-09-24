import { describe, expect, it } from "vitest";

import { LANGUAGE_PRESETS, presetFor } from "@/lib/languages";
import { skipPattern, sortingFor } from "@/lib/sortName";

/**
 * German with its ready-made list, which is what the rules below were first
 * written for. The German cases stay because they are the hardest set: twelve
 * forms, several of them the opening letters of ordinary words.
 */
const german = sortingFor("de", presetFor("de")!.skipWords);
const { compareNames, compareText } = german;

/** Ascending order, the way the list pages use these comparators. */
const sorted = (names: string[], by = compareNames) => [...names].sort(by);

describe("compareNames in German", () => {
  it("files a German noun under its own letter, not its article", () => {
    // The reason this module exists: sorting the raw strings piles most of a
    // German list under D.
    expect(sorted(["die Tür", "der Apfel", "das Buch"])).toEqual([
      "der Apfel",
      "das Buch",
      "die Tür",
    ]);
  });

  it("skips every case form of the definite article", () => {
    expect(sorted(["dem Zug", "den Mann", "des Hauses", "die Blume"])).toEqual([
      "die Blume",
      "des Hauses",
      "den Mann",
      "dem Zug",
    ]);
  });

  it("skips every form of the indefinite article", () => {
    expect(
      sorted([
        "eine Menge",
        "ein Zug",
        "einen Hund",
        "einem Kind",
        "einer Frau",
        "eines Tages",
        "Apfel",
      ]),
    ).toEqual([
      "Apfel",
      "einer Frau",
      "einen Hund",
      "einem Kind",
      "eine Menge",
      "eines Tages",
      "ein Zug",
    ]);
  });

  it("keeps a word whole when it only begins with an article's letters", () => {
    // Without the `\s+` these would be cut to `bahnstraße`, `sert` and
    // `kmal`. Each comparison word sits between the real first letter and
    // the cut one, so the assertion flips if the cut happens; a word outside
    // that gap would pass either way and prove nothing.
    expect(compareNames("Einbahnstraße", "Dach")).toBeGreaterThan(0);
    expect(compareNames("Dessert", "Haus")).toBeLessThan(0);
    expect(compareNames("Denkmal", "Fisch")).toBeLessThan(0);
  });

  it("only skips an article with a word behind it", () => {
    // `Dienstag` starts with "die" as letters, not as an article. The `\s+`
    // in the pattern is what keeps it filed under D rather than as `nstag`,
    // which is why it is compared with a word between D and N.
    expect(compareNames("Dienstag", "Apfel")).toBeGreaterThan(0);
    expect(compareNames("Dienstag", "Hund")).toBeLessThan(0);
  });

  it("keeps a bare article whole, since there is nothing behind it to sort on", () => {
    expect(compareNames("der", "Apfel")).toBeGreaterThan(0);
    expect(compareNames("der", "Zebra")).toBeLessThan(0);
    expect(compareNames("eine", "Apfel")).toBeGreaterThan(0);
    expect(compareNames("eine", "Zebra")).toBeLessThan(0);
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

describe("compareText in German", () => {
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

describe("the skip list", () => {
  it("skips nothing when no language or words are chosen", () => {
    // A new account: the app does not assume a language, so `der Apfel`
    // sorts under D as written.
    const { compareNames: neutral } = sortingFor("", []);
    expect(sorted(["der Apfel", "Chor", "Esel"], neutral)).toEqual([
      "Chor",
      "der Apfel",
      "Esel",
    ]);
  });

  it("skips the words it is given, in any language", () => {
    const french = sortingFor("fr", presetFor("fr")!.skipWords);
    expect(sorted(["la maison", "le chat", "une pomme", "des amis"], french.compareNames)).toEqual([
      "des amis",
      "le chat",
      "la maison",
      "une pomme",
    ]);
  });

  it("skips an elided article with no space after it, either apostrophe", () => {
    // `l'homme` sorts under H. Compared with a word between H and L, so the
    // assertion flips if the elision is not skipped.
    const french = sortingFor("fr", presetFor("fr")!.skipWords);
    expect(french.compareNames("l'homme", "Jardin")).toBeLessThan(0);
    expect(french.compareNames("l’homme", "Jardin")).toBeLessThan(0);
    expect(french.compareNames("l' homme", "Jardin")).toBeLessThan(0);
  });

  it("matches a typed curly apostrophe against a straight one", () => {
    const typed = sortingFor("fr", ["l’"]);
    expect(typed.compareNames("l'homme", "Jardin")).toBeLessThan(0);
  });

  it("keeps a bare elided article whole", () => {
    const french = sortingFor("fr", presetFor("fr")!.skipWords);
    // `l'` alone would be empty once skipped, so it sorts as written: after
    // Kiwi, before Mer.
    expect(french.compareNames("l'", "Kiwi")).toBeGreaterThan(0);
    expect(french.compareNames("l'", "Mer")).toBeLessThan(0);
  });

  it("treats a skip word as plain text, not as a pattern", () => {
    // As patterns, `a+` would skip `aaa` and `.` would skip `x`, leaving
    // Zebra to sort on. As text, neither matches, and each entry sorts under
    // its own first letter. The comparison words sit between the two.
    const odd = sortingFor("", ["a+", "."]);
    expect(odd.compareNames("aaa Zebra", "Birne")).toBeLessThan(0);
    expect(odd.compareNames("x Zebra", "Yacht")).toBeLessThan(0);
    // And typed exactly, they are skipped like any other word.
    expect(odd.compareNames("a+ Zebra", "Yacht")).toBeGreaterThan(0);
    expect(odd.compareNames(". Zebra", "Yacht")).toBeGreaterThan(0);
  });

  it("folds case beyond ASCII", () => {
    const greek = sortingFor("el", ["το"]);
    // "ΤΟ σπίτι" is "το σπίτι" in capitals, and sorts under σ, after π.
    expect(greek.compareNames("ΤΟ σπίτι", "π")).toBeGreaterThan(0);
  });

  it("has a pattern for every ready-made list that has words", () => {
    for (const preset of LANGUAGE_PRESETS) {
      expect(skipPattern(preset.skipWords) === null).toBe(preset.skipWords.length === 0);
    }
  });
});

describe("the alphabetical order", () => {
  it("follows the chosen language", () => {
    // The same three letters in three orders. Swedish files ä after z.
    expect(sorted(["z", "ä", "a"], sortingFor("sv", []).compareText)).toEqual([
      "a",
      "z",
      "ä",
    ]);
    expect(sorted(["z", "ä", "b"], sortingFor("de", []).compareText)).toEqual([
      "ä",
      "b",
      "z",
    ]);
    // Spanish gives ñ its own place after n, so it no longer ties with n.
    expect(sortingFor("es", []).compareText("ñ", "n")).toBeGreaterThan(0);
    expect(sortingFor("es", []).compareText("ñ", "o")).toBeLessThan(0);
  });

  it("uses a pinned neutral order with no language chosen", () => {
    // Not the machine's own locale: an unpinned order would sort the same
    // account's list differently on differently configured browsers.
    const neutral = sortingFor("", []);
    expect(sorted(["z", "ä", "b"], neutral.compareText)).toEqual(["ä", "b", "z"]);
    expect(neutral.compareText("Straße", "Strasse")).toBe(0);
  });

  it("falls back to the neutral order for a language the browser cannot sort in", () => {
    const unknown = sortingFor("qq", []);
    expect(sorted(["z", "ä", "b"], unknown.compareText)).toEqual(["ä", "b", "z"]);
  });
});

describe("sortingFor", () => {
  it("returns the same rules for the same language and words", () => {
    // The list pages' sort memos depend on this identity: a new object on
    // every render would re-sort on every render.
    expect(sortingFor("fr", ["le", "la"])).toBe(sortingFor("fr", ["le", "la"]));
  });

  it("returns new rules when either changes", () => {
    expect(sortingFor("fr", ["le"])).not.toBe(sortingFor("es", ["le"]));
    expect(sortingFor("fr", ["le"])).not.toBe(sortingFor("fr", ["le", "la"]));
  });
});
