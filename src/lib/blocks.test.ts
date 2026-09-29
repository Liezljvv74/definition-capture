import { describe, expect, it } from "vitest";

import {
  cellRange,
  cellsToText,
  clearCells,
  flattenBlocks,
  MAX_BLOCKS,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  moveBlock,
  newTableBlock,
  pasteGrid,
  newTextBlock,
  readBlocks,
  textToGrid,
  withCell,
  withColumn,
  withoutLastColumn,
  withoutLastRow,
  withRow,
} from "@/lib/blocks";
import type { TableBlock } from "@/lib/types";

/**
 * Blocks come off a jsonb column and out of backup files, and both can hold
 * anything. A reader that throws on one odd block would make a whole rule
 * unopenable, and one that quietly straightens a table could hide a cell.
 */
describe("readBlocks", () => {
  it("reads the three kinds and keeps their order", () => {
    const blocks = readBlocks([
      { kind: "text", id: "a", text: "Wem?" },
      { kind: "table", id: "b", headerRow: true, headerColumn: false, cells: [["x", "y"]] },
      { kind: "example", id: "c", sentence: "Ich gebe {dem} Mann", translation: "I give the man" },
    ]);
    expect(blocks.map((block) => block.kind)).toEqual(["text", "table", "example"]);
    expect(blocks[0]).toEqual({ kind: "text", id: "a", text: "Wem?" });
  });

  it("skips what it cannot read, rather than refusing the rule", () => {
    const blocks = readBlocks([null, 42, { kind: "drawing" }, { kind: "text", id: "a", text: "ok" }]);
    expect(blocks).toHaveLength(1);
  });

  it("gives a block without an id one, so React can key it", () => {
    const [block] = readBlocks([{ kind: "text", text: "no id" }]);
    expect(block.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reads a ragged table to one width, padding short rows and never dropping a cell", () => {
    const [table] = readBlocks([{ kind: "table", id: "t", cells: [["a"], ["b", "c", "d"], []] }]) as [
      TableBlock,
    ];
    expect(table.cells).toEqual([
      ["a", "", ""],
      ["b", "c", "d"],
      ["", "", ""],
    ]);
    // The flags default to off; a hand-written file need not spell them out.
    expect(table.headerRow).toBe(false);
    expect(table.headerColumn).toBe(false);
  });

  it("caps a table's width and the number of blocks", () => {
    const wide = Array.from({ length: MAX_TABLE_COLUMNS + 5 }, (_, at) => String(at));
    const [table] = readBlocks([{ kind: "table", id: "t", cells: [wide] }]) as [TableBlock];
    expect(table.cells[0]).toHaveLength(MAX_TABLE_COLUMNS);

    const many = Array.from({ length: MAX_BLOCKS + 10 }, () => ({ kind: "text", id: "x", text: "" }));
    expect(readBlocks(many)).toHaveLength(MAX_BLOCKS);
  });

  it("gives an empty table one empty cell, so it can be edited", () => {
    const [table] = readBlocks([{ kind: "table", id: "t", cells: [] }]) as [TableBlock];
    expect(table.cells).toEqual([[""]]);
  });

  it("reads nothing from something that is not a list", () => {
    expect(readBlocks(null)).toEqual([]);
    expect(readBlocks("text")).toEqual([]);
  });
});

describe("moveBlock", () => {
  const blocks = [newTextBlock(), newTextBlock(), newTextBlock()];
  const ids = (list: typeof blocks) => list.map((block) => block.id);

  it("moves a block to a new place and leaves the rest in order", () => {
    const moved = moveBlock(blocks, 0, 2);
    expect(ids(moved)).toEqual([blocks[1].id, blocks[2].id, blocks[0].id]);
  });

  it("does nothing for a place outside the list, or the same place", () => {
    expect(moveBlock(blocks, 0, 0)).toBe(blocks);
    expect(moveBlock(blocks, 0, 7)).toBe(blocks);
    expect(moveBlock(blocks, -1, 1)).toBe(blocks);
  });
});

describe("table edits", () => {
  const table = withCell(withRow(withColumn(newTableBlock())), 1, 1, "dem");

  it("adds rows and columns of empty cells, keeping every row the same width", () => {
    expect(table.cells).toEqual([
      ["", ""],
      ["", "dem"],
    ]);
  });

  it("removes the last row or column, but never the last of either", () => {
    expect(withoutLastRow(table).cells).toEqual([["", ""]]);
    expect(withoutLastColumn(table).cells).toEqual([[""], [""]]);
    expect(withoutLastRow(withoutLastRow(table)).cells).toEqual([["", ""]]);
    expect(withoutLastColumn(withoutLastColumn(table)).cells).toEqual([[""], [""]]);
  });

  it("does not change the table it was given", () => {
    const before = JSON.stringify(table);
    withCell(table, 0, 0, "x");
    withRow(table);
    expect(JSON.stringify(table)).toBe(before);
  });
});

describe("flattenBlocks", () => {
  it("writes a rule as readable lines for a spreadsheet", async () => {
    const { flattenBlocks } = await import("@/lib/blocks");
    const text = flattenBlocks([
      { kind: "text", id: "a", text: "**Wem?**" },
      { kind: "table", id: "b", headerRow: true, headerColumn: false, cells: [["m", "f"], ["dem", "der"]] },
      { kind: "example", id: "c", sentence: "Ich gebe {dem} Mann", translation: "I give the man" },
    ]);
    expect(text).toBe("Wem?\n\nm | f\ndem | der\n\nIch gebe dem Mann (I give the man)");
  });

  it("leaves off the empty brackets an example with no translation would otherwise flatten to", async () => {
    const { flattenBlocks } = await import("@/lib/blocks");
    const text = flattenBlocks([
      { kind: "example", id: "e", sentence: "Ich gebe {dem} Mann", translation: "" },
    ]);
    expect(text).toBe("Ich gebe dem Mann");
  });
});

describe("flattenBlocks, markup", () => {
  it("leaves highlight markers and link labels out of the spreadsheet", () => {
    const flat = flattenBlocks([
      { kind: "example", id: "e", sentence: "==y:{dem}== Mann", translation: "the ==g:man==" },
      { kind: "text", id: "t", text: "siehe [[Dativ|den Fall]]" },
    ]);
    expect(flat).toContain("dem Mann (the man)");
    expect(flat).toContain("siehe den Fall");
    expect(flat).not.toContain("==");
  });
});

/**
 * Copy, cut and paste in the table editor. The clipboard text is the form
 * spreadsheets use for a block of cells, tabs between cells and a line per
 * row, so a block goes to and from Excel or Google Sheets as well as
 * between two rules.
 */
describe("table clipboard", () => {
  const table: TableBlock = {
    kind: "table",
    id: "t",
    headerRow: true,
    headerColumn: true,
    cells: [
      ["", "m", "f"],
      ["Dat", "dem", "der"],
      ["Akk", "den", "die"],
    ],
  };

  it("makes a rectangle from two corners, whichever way round", () => {
    expect(cellRange([2, 2], [0, 1])).toEqual({ top: 0, left: 1, bottom: 2, right: 2 });
  });

  it("copies a block as tab-separated lines, markup and all", () => {
    const marked = withCell(table, 1, 1, "==y:dem==");
    expect(cellsToText(marked, { top: 1, left: 0, bottom: 2, right: 1 })).toBe("Dat\t==y:dem==\nAkk\tden");
    expect(cellsToText(table, { top: 0, left: 2, bottom: 2, right: 2 })).toBe("f\nder\ndie");
  });

  it("reads clipboard text from a spreadsheet as a grid", () => {
    // Excel ends a copied block with a line break, and Windows uses \r\n.
    expect(textToGrid("a\tb\r\nc\td\r\n")).toEqual([["a", "b"], ["c", "d"]]);
    expect(textToGrid("one word")).toEqual([["one word"]]);
    expect(textToGrid("a\t\tc")).toEqual([["a", "", "c"]]);
  });

  it("empties a block of cells and leaves the rest", () => {
    expect(clearCells(table, { top: 1, left: 1, bottom: 2, right: 1 }).cells).toEqual([
      ["", "m", "f"],
      ["Dat", "", "der"],
      ["Akk", "", "die"],
    ]);
  });

  it("pastes over cells from the given corner", () => {
    const pasted = pasteGrid(table, 1, 1, [["DEM", "DER"]]);
    expect(pasted.cut).toBe(false);
    expect(pasted.table.cells[1]).toEqual(["Dat", "DEM", "DER"]);
    expect(pasted.table.cells[2]).toEqual(["Akk", "den", "die"]);
  });

  it("grows the table to fit, filling new cells with nothing", () => {
    const pasted = pasteGrid(table, 2, 2, [["x", "y"], ["z"]]);
    expect(pasted.table.cells).toEqual([
      ["", "m", "f", ""],
      ["Dat", "dem", "der", ""],
      ["Akk", "den", "x", "y"],
      ["", "", "z", ""],
    ]);
    expect(pasted.cut).toBe(false);
  });

  it("stops at the table's limits and says something was left out", () => {
    const wide = [Array.from({ length: MAX_TABLE_COLUMNS + 3 }, (_, i) => String(i))];
    const pasted = pasteGrid(table, 0, 0, wide);
    expect(pasted.table.cells[0]).toHaveLength(MAX_TABLE_COLUMNS);
    expect(pasted.cut).toBe(true);
    const tall = Array.from({ length: MAX_TABLE_ROWS + 1 }, () => ["x"]);
    expect(pasteGrid(table, 0, 0, tall).table.cells).toHaveLength(MAX_TABLE_ROWS);
  });

  it("does not change the table it was given", () => {
    const before = JSON.stringify(table);
    clearCells(table, { top: 0, left: 0, bottom: 2, right: 2 });
    pasteGrid(table, 0, 0, [["x"]]);
    expect(JSON.stringify(table)).toBe(before);
  });
});
