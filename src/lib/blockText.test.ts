import { describe, expect, it } from "vitest";

import { highlightRuns, parseInline, parseTextBlock, plainText, shownText, type InlineToken, type LeafToken } from "@/lib/blockText";

/**
 * The markup is deliberately tiny: bold, italic, bullets and `[[links]]`.
 * What matters is that anything else, including markup that never closes,
 * comes out as the characters typed. Text that vanishes because a star was
 * left open is the failure this guards against.
 */
describe("parseInline", () => {
  it("reads bold, italic and links in among plain text", () => {
    expect(parseInline("Der **Dativ** ist *wichtig*, siehe [[Cases]].")).toMatchObject([
      { kind: "text", value: "Der " },
      { kind: "bold", value: "Dativ" },
      { kind: "text", value: " ist " },
      { kind: "italic", value: "wichtig" },
      { kind: "text", value: ", siehe " },
      { kind: "link", name: "Cases" },
      { kind: "text", value: "." },
    ]);
  });

  it("reads a link wrapped whole in bold as a bold link, without its stars", () => {
    const tokens = parseInline("see **[[Dativ|dem Fall]]** now");
    expect(tokens).toMatchObject([
      { kind: "text", value: "see " },
      { kind: "link", name: "Dativ", label: "dem Fall", bold: true, at: 14 },
      { kind: "text", value: " now" },
    ]);
    expect(plainText("see **[[Dativ|dem Fall]]** now")).toBe("see dem Fall now");
    expect(parseInline("**[[Dativ]]**")).toMatchObject([{ kind: "link", name: "Dativ", bold: true, at: 4 }]);
  });

  it("shows unclosed markup as the characters typed", () => {
    expect(parseInline("a **b")).toMatchObject([{ kind: "text", value: "a **b" }]);
    expect(parseInline("a *b")).toMatchObject([{ kind: "text", value: "a *b" }]);
    expect(parseInline("a [[b")).toMatchObject([{ kind: "text", value: "a [[b" }]);
    expect(parseInline("2 * 3 * 4")).toMatchObject([{ kind: "text", value: "2 * 3 * 4" }]);
  });

  it("does not read across a line break", () => {
    expect(parseInline("**a\nb**")).toMatchObject([{ kind: "text", value: "**a\nb**" }]);
  });

  it("returns nothing for an empty string", () => {
    expect(parseInline("")).toEqual([]);
  });

  it("reads a labelled link", () => {
    expect(parseInline("gebe [[Dativ|dem]] Mann")).toMatchObject([
      { kind: "text", value: "gebe " },
      { kind: "link", name: "Dativ", label: "dem" },
      { kind: "text", value: " Mann" },
    ]);
    expect(plainText("gebe [[Dativ|dem]] Mann")).toBe("gebe dem Mann");
  });
});

describe("parseTextBlock", () => {
  it("makes a paragraph of each line and a bullet of each line starting with a dash", () => {
    expect(parseTextBlock("First.\n- one\n- two\nLast.")).toMatchObject([
      { kind: "paragraph", tokens: [{ kind: "text", value: "First." }] },
      { kind: "bullet", tokens: [{ kind: "text", value: "one" }] },
      { kind: "bullet", tokens: [{ kind: "text", value: "two" }] },
      { kind: "paragraph", tokens: [{ kind: "text", value: "Last." }] },
    ]);
  });

  it("drops blank lines, and keeps a dash that is not a bullet", () => {
    expect(parseTextBlock("a\n\n\n-b")).toMatchObject([
      { kind: "paragraph", tokens: [{ kind: "text", value: "a" }] },
      { kind: "paragraph", tokens: [{ kind: "text", value: "-b" }] },
    ]);
  });
});

describe("plainText", () => {
  it("strips the markup and the braces, keeping the words", () => {
    expect(plainText("**Dativ** und *Akkusativ*, siehe [[Cases]]: {dem}")).toBe(
      "Dativ und Akkusativ, siehe Cases: dem",
    );
  });

  it("leaves out highlight markers", () => {
    expect(plainText("==y:**Dativ**== und ==b:{dem}==")).toBe("Dativ und dem");
  });
});

/** Every leaf, including those inside highlights. */
function leaves(tokens: InlineToken[]): LeafToken[] {
  return tokens.flatMap((t) => (t.kind === "highlight" ? leaves(t.tokens) : [t]));
}

/**
 * The contract the selection toolbar stands on: a leaf's words sit in the
 * source exactly where `at` says, inside the span `from` and `to` give.
 */
function expectPositions(source: string, tokens: InlineToken[]) {
  for (const leaf of leaves(tokens)) {
    const words = shownText(leaf);
    expect(source.slice(leaf.at, leaf.at + words.length)).toBe(words);
    expect(source.slice(leaf.from, leaf.to)).toContain(words);
  }
}

describe("positions", () => {
  it("records where every token's words sit in the source", () => {
    const source = "Der **Dativ**, *wem*, [[ Cases ]] und [[Dativ| dem ]] ==g:hier **fett**==.";
    expectPositions(source, parseInline(source));
  });

  it("counts from the start of the whole block, past bullets and blank lines", () => {
    const source = "Erst.\n\n- **eins** und [[zwei]]\nDrei ==y:vier==";
    expectPositions(source, parseTextBlock(source).flatMap((line) => line.tokens));
  });

  it("records gaps in a sentence", () => {
    const source = "Ich gebe ==b:{dem} Mann== das Buch";
    expectPositions(source, parseInline(source, "sentence"));
  });
});

describe("highlights", () => {
  it("reads a highlight and the markup inside it", () => {
    expect(parseInline("a ==y:**b** c== d")).toMatchObject([
      { kind: "text", value: "a " },
      {
        kind: "highlight",
        colour: "yellow",
        from: 2,
        to: 15,
        tokens: [
          { kind: "bold", value: "b" },
          { kind: "text", value: " c" },
        ],
      },
      { kind: "text", value: " d" },
    ]);
  });

  it("reads every colour", () => {
    const colours = parseInline("==y:a== ==g:b== ==b:c== ==p:d==").flatMap((t) => (t.kind === "highlight" ? [t.colour] : []));
    expect(colours).toEqual(["yellow", "green", "blue", "purple"]);
  });

  it("leaves anything that is not a highlight as typed", () => {
    for (const text of ["a == b", "x==y", "==y:==", "==q:word==", "==y:open"]) {
      const tokens = parseInline(text);
      expect(tokens.some((t) => t.kind === "highlight")).toBe(false);
      expect(leaves(tokens).map(shownText).join("")).toBe(text);
    }
  });

  it("takes no links or bold in a translation, only highlights", () => {
    expect(parseInline("the ==g:**man**== [[x]]", "plain")).toMatchObject([
      { kind: "text", value: "the " },
      { kind: "highlight", tokens: [{ kind: "text", value: "**man**" }] },
      { kind: "text", value: " [[x]]" },
    ]);
  });
});

describe("highlightRuns", () => {
  it("cuts the text at its markers, keeping every character", () => {
    expect(highlightRuns("a ==g:b== c")).toEqual([
      { text: "a " },
      { text: "==g:", marker: true },
      { text: "b", colour: "green" },
      { text: "==", marker: true },
      { text: " c" },
    ]);
    for (const text of ["", "x == y", "==y:a==\n- ==b:c==", "==y:open"]) {
      expect(highlightRuns(text).map((run) => run.text).join("")).toBe(text);
    }
  });
});

describe("gaps in a sentence", () => {
  it("marks the words in braces", () => {
    expect(parseInline("Ich gebe {dem} Mann {das} Buch", "sentence")).toMatchObject([
      { kind: "text", value: "Ich gebe " },
      { kind: "gap", value: "dem" },
      { kind: "text", value: " Mann " },
      { kind: "gap", value: "das" },
      { kind: "text", value: " Buch" },
    ]);
  });

  it("leaves an unclosed or empty brace as text, and reads no links or bold", () => {
    expect(parseInline("a {b", "sentence")).toMatchObject([{ kind: "text", value: "a {b" }]);
    expect(parseInline("a {} b", "sentence")).toMatchObject([{ kind: "text", value: "a {} b" }]);
    expect(parseInline("[[a]] **b**", "sentence")).toMatchObject([{ kind: "text", value: "[[a]] **b**" }]);
  });
});
