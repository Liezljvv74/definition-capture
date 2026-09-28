import { describe, expect, it } from "vitest";

import {
  addHighlight,
  applyLink,
  combinePoints,
  fieldText,
  highlightCells,
  linkRange,
  removeHighlight,
  unhighlightCells,
  withFieldText,
} from "@/lib/selectionEdits";
import type { Block, TableBlock } from "@/lib/types";

/** A selection of `words` in `text`, where they first occur. */
const pick = (text: string, words: string, field = "text") => {
  const start = text.indexOf(words);
  if (start === -1) throw new Error(`"${words}" is not in "${text}"`);
  return { blockId: "b", field, start, end: start + words.length };
};
const span = (start: number, end: number, field = "text") => ({ blockId: "b", field, start, end });

describe("combinePoints", () => {
  it("orders the two ends, whichever way the selection was dragged", () => {
    expect(combinePoints({ blockId: "b", field: "text", offset: 9 }, { blockId: "b", field: "text", offset: 3 })).toEqual(
      span(3, 9),
    );
  });

  it("refuses a selection across two blocks, out of a table, or with nothing in it", () => {
    const a = { blockId: "b", field: "cell:0:0", offset: 1 };
    expect(combinePoints(a, { ...a, blockId: "c" })).toBeNull();
    expect(combinePoints(a, { ...a, field: "text" })).toBeNull();
    expect(combinePoints({ ...a, field: "sentence" }, { ...a, field: "translation" })).toBeNull();
    expect(combinePoints(a, a)).toBeNull();
    expect(combinePoints(a, { ...a, offset: null })).toBeNull();
    expect(combinePoints(a, null)).toBeNull();
  });

  it("makes a selection across cells the rectangle between its corners, whichever way it was dragged", () => {
    const at = (field: string, offset: number | null = 0) => ({ blockId: "t", field, offset });
    expect(combinePoints(at("cell:0:1", 2), at("cell:2:1"))).toEqual({ blockId: "t", top: 0, left: 1, bottom: 2, right: 1 });
    expect(combinePoints(at("cell:2:2"), at("cell:0:0", null))).toEqual({ blockId: "t", top: 0, left: 0, bottom: 2, right: 2 });
  });
});

describe("highlighting cells", () => {
  const table: TableBlock = {
    kind: "table",
    id: "t",
    headerRow: true,
    headerColumn: false,
    cells: [
      ["", "m", "f"],
      ["Dat", "==y:dem== Mann", ""],
      ["Akk", "2 == 2", "die"],
    ],
  };
  const column = { blockId: "t", top: 0, left: 1, bottom: 2, right: 1 };

  it("highlights every cell in the rectangle whole, and leaves the rest alone", () => {
    expect(highlightCells(table, column, "purple")?.cells).toEqual([
      ["", "==p:m==", "f"],
      ["Dat", "==p:dem Mann==", ""],
      // Left as typed: wrapping it would close the marker at its own "==".
      ["Akk", "2 == 2", "die"],
    ]);
  });

  it("skips empty cells, and is null when nothing would change", () => {
    const corner = { blockId: "t", top: 0, left: 0, bottom: 0, right: 0 };
    expect(highlightCells(table, corner, "yellow")).toBeNull();
    const done = highlightCells(table, column, "green")!;
    expect(highlightCells(done, column, "green")).toBeNull();
  });

  it("clears every highlight in the rectangle, and is null when there is none", () => {
    const all = { blockId: "t", top: 0, left: 0, bottom: 2, right: 2 };
    expect(unhighlightCells(table, all)?.cells[1][1]).toBe("dem Mann");
    expect(unhighlightCells(table, { blockId: "t", top: 2, left: 0, bottom: 2, right: 2 })).toBeNull();
  });
});

describe("fields", () => {
  const table: Block = { kind: "table", id: "t", headerRow: false, headerColumn: false, cells: [["a", "b"], ["c", "d"]] };
  const example: Block = { kind: "example", id: "e", sentence: "s", translation: "t" };

  it("reads and writes each kind of field", () => {
    expect(fieldText(table, "cell:1:0")).toBe("c");
    expect(withFieldText(table, "cell:1:0", "x")).toMatchObject({ cells: [["a", "b"], ["x", "d"]] });
    expect(fieldText(example, "translation")).toBe("t");
    expect(withFieldText(example, "sentence", "x")).toMatchObject({ sentence: "x", translation: "t" });
    expect(fieldText({ kind: "text", id: "x", text: "hi" }, "text")).toBe("hi");
  });

  it("finds nothing for a field the block does not have", () => {
    expect(fieldText(table, "cell:5:0")).toBeNull();
    expect(fieldText(example, "text")).toBeNull();
  });
});

describe("addHighlight", () => {
  it("wraps the selected words", () => {
    const text = "Der Dativ antwortet auf wem.";
    expect(addHighlight(text, "text", pick(text, "antwortet"), "yellow")).toBe("Der Dativ ==y:antwortet== auf wem.");
  });

  it("leaves out the spaces a double click takes with a word", () => {
    const text = "auf wem und";
    expect(addHighlight(text, "text", pick(text, " wem "), "green")).toBe("auf ==g:wem== und");
  });

  it("takes the whole of bold, a link or a gap it starts or ends inside", () => {
    const text = "Der **Dativ** und [[Fälle|die Fälle]] hier";
    expect(addHighlight(text, "text", span(text.indexOf("tiv"), text.indexOf("die") + 3), "blue")).toBe(
      "Der ==b:**Dativ** und [[Fälle|die Fälle]]== hier",
    );
    const sentence = "Ich gebe {dem} Mann";
    expect(
      addHighlight(sentence, "sentence", span(sentence.indexOf("em"), sentence.indexOf("Mann") + 4, "sentence"), "yellow"),
    ).toBe("Ich gebe ==y:{dem} Mann==");
  });

  it("recolours a highlight the selection is inside", () => {
    const text = "a ==y:Dativ== b";
    expect(addHighlight(text, "text", pick(text, "ati"), "green")).toBe("a ==g:Dativ== b");
  });

  it("counts offsets across the lines of a text block", () => {
    const text = "Erst.\n- zwei **drei**";
    expect(addHighlight(text, "text", pick(text, "zwei"), "yellow")).toBe("Erst.\n- ==y:zwei== **drei**");
  });

  it("refuses what would break a marker, and a selection of only spaces", () => {
    expect(addHighlight("eins\nzwei", "text", span(1, 7), "yellow")).toBeNull();
    expect(addHighlight("==y:a== und ==g:b==", "text", span(4, 16), "blue")).toBeNull();
    const sums = "2 == 2 und x = y";
    expect(addHighlight(sums, "text", pick(sums, "2 == 2"), "yellow")).toBeNull();
    expect(addHighlight(sums, "text", pick(sums, "= y"), "yellow")).toBeNull();
    expect(addHighlight("a   b", "text", pick("a   b", "   "), "yellow")).toBeNull();
  });

  it("refuses a highlight an unclosed opener earlier on the line would swallow", () => {
    const text = "==g:abc def";
    expect(addHighlight(text, "text", pick(text, "def"), "yellow")).toBeNull();
  });

  it("refuses a highlight that would pull a bullet's marker inside it", () => {
    expect(addHighlight("- zwei", "text", span(0, 4), "yellow")).toBeNull();
  });
});

describe("removeHighlight", () => {
  it("takes the markers off and keeps the words", () => {
    const text = "a ==g:**Dativ** hier== b";
    expect(removeHighlight(text, "text", pick(text, "hier"))).toBe("a **Dativ** hier b");
  });

  it("takes off every highlight the selection touches, and is null when there is none", () => {
    expect(removeHighlight("==y:a== und ==b:c==", "text", span(4, 17))).toBe("a und c");
    expect(removeHighlight("plain", "text", pick("plain", "lai"))).toBeNull();
  });

  it("refuses to take off a marker that leaves a literal star read as italic", () => {
    expect(removeHighlight("==y:*a==*", "text", span(4, 6))).toBeNull();
  });
});

describe("links from a selection", () => {
  it("keeps the words as written, labelling the link when they are not the name", () => {
    const text = "Ich gebe dem Mann";
    expect(applyLink(text, linkRange(text, "text", pick(text, "dem"))!, "Dativ")).toBe("Ich gebe [[Dativ|dem]] Mann");
    const same = "siehe Dativ.";
    expect(applyLink(same, linkRange(same, "text", pick(same, "Dativ"))!, "Dativ")).toBe("siehe [[Dativ]].");
    const cased = "siehe dativ.";
    expect(applyLink(cased, linkRange(cased, "text", pick(cased, "dativ"))!, "Dativ")).toBe("siehe [[Dativ|dativ]].");
  });

  it("links inside a highlight, and in a table cell", () => {
    const text = "==y:gebe dem Mann==";
    expect(applyLink(text, linkRange(text, "text", pick(text, "dem"))!, "Dativ")).toBe("==y:gebe [[Dativ|dem]] Mann==");
    expect(linkRange("dem", "cell:1:2", pick("dem", "dem", "cell:1:2"))).toEqual({ start: 0, end: 3, words: "dem" });
  });

  it("refuses bold, links, brackets, examples and more than one line", () => {
    const text = "**dem** [[Fall]] a [b] c\nd";
    expect(linkRange(text, "text", pick(text, "dem"))).toBeNull();
    expect(linkRange(text, "text", pick(text, "Fall"))).toBeNull();
    expect(linkRange(text, "text", pick(text, "[b]"))).toBeNull();
    expect(linkRange(text, "text", pick(text, "c\nd"))).toBeNull();
    expect(linkRange("gebe dem", "sentence", pick("gebe dem", "dem", "sentence"))).toBeNull();
    expect(linkRange("a\nb", "cell:0:0", span(0, 3, "cell:0:0"))).toBeNull();
  });
});
