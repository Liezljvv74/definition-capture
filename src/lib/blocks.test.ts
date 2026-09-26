import { describe, expect, it } from "vitest";

import {
  MAX_BLOCKS,
  MAX_TABLE_COLUMNS,
  moveBlock,
  newTableBlock,
  newTextBlock,
  readBlocks,
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
