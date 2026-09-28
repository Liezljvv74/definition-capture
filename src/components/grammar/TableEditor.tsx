"use client";

import { useRef, useState } from "react";

import { wideTableClass } from "@/components/grammar/BlockView";
import { MarkedField } from "@/components/grammar/MarkedField";
import {
  cellRange,
  cellsToText,
  clearCells,
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  pasteGrid,
  textToGrid,
  withCell,
  withColumn,
  withoutLastColumn,
  withoutLastRow,
  withRow,
  type CellRange,
} from "@/lib/blocks";
import type { TableBlock } from "@/lib/types";

/** A plain grey bar, wide above a column and tall beside a row: easier to see and to hit than a glyph. */
const handle =
  "block cursor-pointer rounded-sm bg-slate-200 transition hover:bg-indigo-300 dark:bg-slate-700 dark:hover:bg-indigo-500";

/**
 * A table's cells as text boxes, with handles above the columns and beside
 * the rows to select them, Shift-click to select the block between two
 * cells, and copy, cut and paste of what is selected. Typing in a cell works
 * as it always has; the selection only exists until the next keystroke in a
 * cell, a plain click in one, or Escape.
 *
 * The handles are out of the Tab order, so Tab still moves from cell to
 * cell across each row. They are for the mouse, the way a spreadsheet's
 * row and column headers are.
 */
export function TableEditor({
  block,
  onChange,
  inputId,
}: {
  block: TableBlock;
  onChange: (block: TableBlock) => void;
  inputId: string;
}) {
  const [range, setRange] = useState<CellRange | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** Where a Shift-click extends from: the cell last clicked or typed in, or where a handle selection began. */
  const anchor = useRef<[number, number]>([0, 0]);
  /** True while `select` itself moves the caret, whose focus must not move the anchor. */
  const moving = useRef(false);

  const rows = block.cells.length;
  const columns = block.cells[0].length;
  // Removing the last row or column can leave a selection pointing past the
  // table; it then simply stops being a selection.
  const selected = range && range.bottom < rows && range.right < columns ? range : null;
  const cellId = (r: number, c: number) => `${inputId}-${r}-${c}`;

  /**
   * Selects, and puts the caret in the selection's first cell. The keys for
   * copy, cut and paste only reach the table from inside a text box: a
   * handle is a button, and a button gets none of them.
   */
  function select(next: CellRange) {
    setRange(next);
    setNote(null);
    moving.current = true;
    document.getElementById(cellId(next.top, next.left))?.focus();
    moving.current = false;
  }

  function selectRows(r: number, extend: boolean) {
    const from = extend ? anchor.current[0] : r;
    if (!extend) anchor.current = [r, 0];
    select({ top: Math.min(from, r), bottom: Math.max(from, r), left: 0, right: columns - 1 });
  }

  function selectColumns(c: number, extend: boolean) {
    const from = extend ? anchor.current[1] : c;
    if (!extend) anchor.current = [0, c];
    select({ top: 0, bottom: rows - 1, left: Math.min(from, c), right: Math.max(from, c) });
  }

  const small = "btn btn-secondary px-2.5 py-1 text-xs";
  const inside = (r: number, c: number) =>
    selected !== null && r >= selected.top && r <= selected.bottom && c >= selected.left && c <= selected.right;

  return (
    <div
      className="space-y-2"
      onKeyDown={(event) => {
        if (event.key === "Escape" && selected) setRange(null);
      }}
      onCopy={(event) => {
        if (!selected) return;
        event.preventDefault();
        event.clipboardData.setData("text/plain", cellsToText(block, selected));
      }}
      onCut={(event) => {
        if (!selected) return;
        event.preventDefault();
        event.clipboardData.setData("text/plain", cellsToText(block, selected));
        onChange(clearCells(block, selected));
      }}
      onPaste={(event) => {
        const grid = textToGrid(event.clipboardData.getData("text/plain"));
        // One value into one cell is ordinary typing: left to the text box,
        // so it lands at the caret rather than replacing the cell.
        if (!selected && grid.length === 1 && grid[0].length === 1) return;
        event.preventDefault();
        const [top, left] = selected ? [selected.top, selected.left] : anchor.current;
        const pasted = pasteGrid(block, top, left, grid);
        onChange(pasted.table);
        const width = Math.max(...grid.map((row) => row.length));
        setRange(cellRange([top, left], [Math.min(top + grid.length, MAX_TABLE_ROWS) - 1, Math.min(left + width, MAX_TABLE_COLUMNS) - 1]));
        setNote(
          pasted.cut
            ? `A table holds at most ${MAX_TABLE_ROWS} rows and ${MAX_TABLE_COLUMNS} columns, so the cells past that were left out.`
            : null,
        );
      }}
    >
      <div className={wideTableClass}>
        <table className="border-collapse">
          <tbody>
            <tr>
              <td className="p-0.5 text-center">
                <button
                  type="button"
                  tabIndex={-1}
                  className={`${handle} mx-auto size-3`}
                  aria-label="Select the whole table"
                  title="Select the whole table"
                  onClick={() => {
                    anchor.current = [0, 0];
                    select({ top: 0, left: 0, bottom: rows - 1, right: columns - 1 });
                  }}
                 />
              </td>
              {block.cells[0].map((_, c) => (
                <td key={c} className="p-0.5 text-center">
                  <button
                    type="button"
                    tabIndex={-1}
                    className={`${handle} mx-auto h-2.5 w-10`}
                    aria-label={`Select column ${c + 1}`}
                    title={`Select column ${c + 1}. Shift-click to select up to here.`}
                    onClick={(event) => selectColumns(c, event.shiftKey)}
                   />
                </td>
              ))}
            </tr>
            {block.cells.map((row, r) => (
              <tr key={r}>
                <td className="p-0.5 text-center">
                  <button
                    type="button"
                    tabIndex={-1}
                    className={`${handle} mx-auto h-7 w-2.5`}
                    aria-label={`Select row ${r + 1}`}
                    title={`Select row ${r + 1}. Shift-click to select up to here.`}
                    onClick={(event) => selectRows(r, event.shiftKey)}
                   />
                </td>
                {row.map((cell, c) => {
                  const isHeader = (block.headerRow && r === 0) || (block.headerColumn && c === 0);
                  return (
                    <td
                      key={c}
                      className="border border-slate-200 p-0.5 dark:border-slate-700"
                      onMouseDown={(event) => {
                        if (event.shiftKey) {
                          // Kept from the text box, which would otherwise
                          // take the click as the start of a text selection.
                          event.preventDefault();
                          select(cellRange(anchor.current, [r, c]));
                        } else {
                          setRange(null);
                          anchor.current = [r, c];
                        }
                      }}
                      onFocus={() => {
                        if (!moving.current) anchor.current = [r, c];
                      }}
                    >
                      <label htmlFor={cellId(r, c)} className="sr-only">
                        {`Row ${r + 1}, column ${c + 1}`}
                      </label>
                      <MarkedField
                        id={cellId(r, c)}
                        // Sized to what is typed, so a long cell widens its column
                        // rather than hiding its end inside a fixed-width box.
                        className={`field min-w-24 max-w-xl py-1 [field-sizing:content] ${isHeader ? "font-semibold" : ""} ${inside(r, c) ? "ring-2 ring-indigo-500 dark:ring-indigo-400" : ""}`}
                        value={cell}
                        onChange={(value) => {
                          setRange(null);
                          onChange(withCell(block, r, c, value));
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note && <p className="text-sm text-amber-700 dark:text-amber-400">{note}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={small} disabled={rows >= MAX_TABLE_ROWS} onClick={() => onChange(withRow(block))}>Add row</button>
        <button type="button" className={small} disabled={rows <= 1} onClick={() => onChange(withoutLastRow(block))}>Remove last row</button>
        <button type="button" className={small} disabled={columns >= MAX_TABLE_COLUMNS} onClick={() => onChange(withColumn(block))}>Add column</button>
        <button type="button" className={small} disabled={columns <= 1} onClick={() => onChange(withoutLastColumn(block))}>Remove last column</button>
        <label className="ml-2 inline-flex items-center gap-1.5 text-sm">
          <input type="checkbox" className="accent-indigo-600" checked={block.headerRow} onChange={(event) => onChange({ ...block, headerRow: event.target.checked })} />
          First row is a header
        </label>
        <label className="inline-flex items-center gap-1.5 text-sm">
          <input type="checkbox" className="accent-indigo-600" checked={block.headerColumn} onChange={(event) => onChange({ ...block, headerColumn: event.target.checked })} />
          First column is a header
        </label>
      </div>
    </div>
  );
}
