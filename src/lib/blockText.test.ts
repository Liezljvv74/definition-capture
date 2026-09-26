import { describe, expect, it } from "vitest";

import { parseInline, parseTextBlock, plainText, splitGaps } from "@/lib/blockText";

/**
 * The markup is deliberately tiny: bold, italic, bullets and `[[links]]`.
 * What matters is that anything else, including markup that never closes,
 * comes out as the characters typed. Text that vanishes because a star was
 * left open is the failure this guards against.
 */
describe("parseInline", () => {
  it("reads bold, italic and links in among plain text", () => {
    expect(parseInline("Der **Dativ** ist *wichtig*, siehe [[Cases]].")).toEqual([
      { kind: "text", value: "Der " },
      { kind: "bold", value: "Dativ" },
      { kind: "text", value: " ist " },
      { kind: "italic", value: "wichtig" },
      { kind: "text", value: ", siehe " },
      { kind: "link", name: "Cases" },
      { kind: "text", value: "." },
    ]);
  });

  it("shows unclosed markup as the characters typed", () => {
    expect(parseInline("a **b")).toEqual([{ kind: "text", value: "a **b" }]);
    expect(parseInline("a *b")).toEqual([{ kind: "text", value: "a *b" }]);
    expect(parseInline("a [[b")).toEqual([{ kind: "text", value: "a [[b" }]);
    expect(parseInline("2 * 3 * 4")).toEqual([{ kind: "text", value: "2 * 3 * 4" }]);
  });

  it("does not read across a line break", () => {
    expect(parseInline("**a\nb**")).toEqual([{ kind: "text", value: "**a\nb**" }]);
  });

  it("returns nothing for an empty string", () => {
    expect(parseInline("")).toEqual([]);
  });
});

describe("parseTextBlock", () => {
  it("makes a paragraph of each line and a bullet of each line starting with a dash", () => {
    expect(parseTextBlock("First.\n- one\n- two\nLast.")).toEqual([
      { kind: "paragraph", tokens: [{ kind: "text", value: "First." }] },
      { kind: "bullet", tokens: [{ kind: "text", value: "one" }] },
      { kind: "bullet", tokens: [{ kind: "text", value: "two" }] },
      { kind: "paragraph", tokens: [{ kind: "text", value: "Last." }] },
    ]);
  });

  it("drops blank lines, and keeps a dash that is not a bullet", () => {
    expect(parseTextBlock("a\n\n\n-b")).toEqual([
      { kind: "paragraph", tokens: [{ kind: "text", value: "a" }] },
      { kind: "paragraph", tokens: [{ kind: "text", value: "-b" }] },
    ]);
  });
});

describe("splitGaps", () => {
  it("marks the words in braces", () => {
    expect(splitGaps("Ich gebe {dem} Mann {das} Buch")).toEqual([
      { value: "Ich gebe ", gap: false },
      { value: "dem", gap: true },
      { value: " Mann ", gap: false },
      { value: "das", gap: true },
      { value: " Buch", gap: false },
    ]);
  });

  it("leaves an unclosed or empty brace as text", () => {
    expect(splitGaps("a {b")).toEqual([{ value: "a {b", gap: false }]);
    expect(splitGaps("a {} b")).toEqual([{ value: "a {} b", gap: false }]);
  });
});

describe("plainText", () => {
  it("strips the markup and the braces, keeping the words", () => {
    expect(plainText("**Dativ** und *Akkusativ*, siehe [[Cases]]: {dem}")).toBe(
      "Dativ und Akkusativ, siehe Cases: dem",
    );
  });
});
