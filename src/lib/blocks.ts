import { plainText } from "@/lib/blockText";
import { readString, type Block, type ExampleBlock, type TableBlock, type TextBlock } from "@/lib/types";

/** Matches the check on `items.blocks`. */
export const MAX_BLOCKS = 200;
/** Enough for any paradigm; a guard against a runaway file, not a design limit. */
export const MAX_TABLE_ROWS = 30;
export const MAX_TABLE_COLUMNS = 12;

/**
 * A block id is only a key: React needs one to keep an editor's state with
 * its block through a reorder, and nothing else reads it. Made here rather
 * than by `createId` in `remoteStore` so this module stays free of the
 * database and its session, which its tests do not need.
 */
const newId = () => crypto.randomUUID();

export const newTextBlock = (): TextBlock => ({ kind: "text", id: newId(), text: "" });
export const newTableBlock = (): TableBlock => ({
  kind: "table",
  id: newId(),
  headerRow: true,
  headerColumn: false,
  cells: [[""]],
});
export const newExampleBlock = (): ExampleBlock => ({
  kind: "example",
  id: newId(),
  sentence: "",
  translation: "",
});

/**
 * A table's cells off unknown JSON: every row read to the same width, the
 * widest row's, so a cell is never dropped because its row was longer than
 * the one above. Short rows are padded with empty cells. At least one cell
 * always, so an empty table can still be edited.
 */
function readCells(value: unknown): string[][] {
  const rows = (Array.isArray(value) ? value : [])
    .slice(0, MAX_TABLE_ROWS)
    .map((row) => (Array.isArray(row) ? row.map((cell) => readString(cell)) : []));
  const widest = Math.max(0, ...rows.map((row) => row.length));
  const width = Math.max(1, Math.min(MAX_TABLE_COLUMNS, widest));
  if (rows.length === 0) rows.push([]);
  return rows.map((row) => Array.from({ length: width }, (_, at) => row[at] ?? ""));
}

function readBlock(raw: unknown): Block | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const id = readString(value.id).trim() || newId();
  switch (value.kind) {
    case "text":
      return { kind: "text", id, text: readString(value.text) };
    case "table":
      return {
        kind: "table",
        id,
        headerRow: value.headerRow === true,
        headerColumn: value.headerColumn === true,
        cells: readCells(value.cells),
      };
    case "example":
      return {
        kind: "example",
        id,
        sentence: readString(value.sentence),
        translation: readString(value.translation),
      };
    default:
      // A block type this version does not know, such as a drawing from a
      // later one, is skipped rather than refusing the rule around it.
      return null;
  }
}

/**
 * The blocks off a jsonb column or a backup. Anything unreadable is skipped
 * rather than throwing: a rule with one odd block should still open.
 */
export function readBlocks(value: unknown): Block[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, MAX_BLOCKS)
    .map(readBlock)
    .filter((block): block is Block => block !== null);
}

/** The list with the block at `from` moved to `to`; the same list when there is nothing to do. */
export function moveBlock<T extends Block>(blocks: T[], from: number, to: number): T[] {
  const inRange = (at: number) => at >= 0 && at < blocks.length;
  if (from === to || !inRange(from) || !inRange(to)) return blocks;
  const next = [...blocks];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/* The table edits return a new block; the editor keeps the old one until it
   is saved, so an edit that is cancelled costs nothing. */

export function withRow(table: TableBlock): TableBlock {
  if (table.cells.length >= MAX_TABLE_ROWS) return table;
  const width = table.cells[0]?.length ?? 1;
  return { ...table, cells: [...table.cells, Array.from({ length: width }, () => "")] };
}

export function withoutLastRow(table: TableBlock): TableBlock {
  if (table.cells.length <= 1) return table;
  return { ...table, cells: table.cells.slice(0, -1) };
}

export function withColumn(table: TableBlock): TableBlock {
  if ((table.cells[0]?.length ?? 0) >= MAX_TABLE_COLUMNS) return table;
  return { ...table, cells: table.cells.map((row) => [...row, ""]) };
}

export function withoutLastColumn(table: TableBlock): TableBlock {
  if ((table.cells[0]?.length ?? 0) <= 1) return table;
  return { ...table, cells: table.cells.map((row) => row.slice(0, -1)) };
}

export function withCell(table: TableBlock, row: number, column: number, value: string): TableBlock {
  return {
    ...table,
    cells: table.cells.map((cells, r) =>
      r === row ? cells.map((cell, c) => (c === column ? value : cell)) : cells,
    ),
  };
}

/**
 * A rule's content as one string, for the Excel sheet, where a cell cannot
 * hold blocks. Tables become one line per row with cells separated by a
 * pipe, examples show the translation in brackets, and the markup is
 * stripped. The JSON backup protects the content; this is for glancing at.
 */
export function flattenBlocks(blocks: Block[]): string {
  return blocks
    .map((block) => {
      switch (block.kind) {
        case "text":
          return plainText(block.text);
        case "table":
          return block.cells.map((row) => row.map(plainText).join(" | ")).join("\n");
        case "example":
          return `${plainText(block.sentence)} (${block.translation})`;
      }
    })
    .filter((text) => text.trim() !== "")
    .join("\n\n");
}
