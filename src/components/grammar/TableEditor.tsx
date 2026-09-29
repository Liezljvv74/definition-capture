"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";

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

/** What a press that is still held down is selecting, as the pointer moves. */
type Drag = "cells" | "rows" | "columns" | null;

/**
 * A table's cells as text boxes, with the ways of selecting a spreadsheet
 * has: press in a cell and drag to another to select the block between them
 * (a drag inside one cell still selects its text), Shift-click a cell to do
 * the same, and the grey bars above the columns and beside the rows to
 * select whole ones, dragged along or Shift-clicked for several. Copy, cut
 * and paste work from the keys, from the menu a right-click opens, and from
 * the buttons shown while cells are selected. Typing in a cell works as it
 * always has; the selection lasts until the next keystroke in a cell, a
 * plain click in one outside it, or Escape.
 *
 * The bars are out of the Tab order, so Tab still moves from cell to cell
 * across each row. They are for the mouse, the way a spreadsheet's row and
 * column headers are.
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
  /** Where a Shift-click or a drag extends from: the cell pressed, clicked or typed in, or the bar a drag began on. */
  const anchor = useRef<[number, number]>([0, 0]);
  /** True while `select` itself moves the caret, whose focus must not move the anchor. */
  const moving = useRef(false);
  const [drag, setDrag] = useState<Drag>(null);

  // A drag ends wherever the button is let go, which may be outside the table.
  useEffect(() => {
    if (!drag) return;
    const end = () => setDrag(null);
    window.addEventListener("mouseup", end);
    return () => window.removeEventListener("mouseup", end);
  }, [drag]);

  const rows = block.cells.length;
  const columns = block.cells[0].length;
  // Removing the last row or column can leave a selection pointing past the
  // table; it then simply stops being a selection.
  const selected = range && range.bottom < rows && range.right < columns ? range : null;
  const cellId = (r: number, c: number) => `${inputId}-${r}-${c}`;
  const inside = (r: number, c: number) =>
    selected !== null && r >= selected.top && r <= selected.bottom && c >= selected.left && c <= selected.right;

  /**
   * Selects, and puts the caret in the selection's first cell. The keys for
   * copy, cut and paste only reach the table from inside a text box: a bar
   * is a button, and a button gets none of them.
   */
  function select(next: CellRange) {
    setRange(next);
    setNote(null);
    moving.current = true;
    document.getElementById(cellId(next.top, next.left))?.focus();
    moving.current = false;
  }

  const rowsTo = (r: number): CellRange => ({ top: Math.min(anchor.current[0], r), bottom: Math.max(anchor.current[0], r), left: 0, right: columns - 1 });
  const columnsTo = (c: number): CellRange => ({ top: 0, bottom: rows - 1, left: Math.min(anchor.current[1], c), right: Math.max(anchor.current[1], c) });

  function paste(text: string, from: [number, number]) {
    const grid = textToGrid(text);
    const [top, left] = from;
    const pasted = pasteGrid(block, top, left, grid);
    onChange(pasted.table);
    const width = Math.max(...grid.map((row) => row.length));
    setRange(cellRange([top, left], [Math.min(top + grid.length, MAX_TABLE_ROWS) - 1, Math.min(left + width, MAX_TABLE_COLUMNS) - 1]));
    setNote(
      pasted.cut
        ? `A table holds at most ${MAX_TABLE_ROWS} rows and ${MAX_TABLE_COLUMNS} columns, so the cells past that were left out.`
        : null,
    );
  }

  /**
   * The buttons go through the asynchronous clipboard, which a browser may
   * refuse, for reading above all; the keys and the menu never need it.
   */
  async function viaClipboard(action: "copy" | "cut" | "paste") {
    if (!selected) return;
    try {
      if (action === "paste") {
        paste(await navigator.clipboard.readText(), [selected.top, selected.left]);
        return;
      }
      await navigator.clipboard.writeText(cellsToText(block, selected));
      if (action === "cut") onChange(clearCells(block, selected));
    } catch {
      setNote(`This browser did not let the page use the clipboard. Press Ctrl+${action === "copy" ? "C" : action === "cut" ? "X" : "V"} instead (Cmd on a Mac).`);
    }
  }

  const small = "btn btn-secondary px-2.5 py-1 text-xs";
  // Kept from the bars and buttons, which would otherwise take the focus
  // away from the cell whose text box the keys reach the table through.
  const keepFocus = (event: MouseEvent) => event.preventDefault();

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
        const text = event.clipboardData.getData("text/plain");
        const grid = textToGrid(text);
        // One value into one cell is ordinary typing: left to the text box,
        // so it lands at the caret rather than replacing the cell.
        if (!selected && grid.length === 1 && grid[0].length === 1) return;
        event.preventDefault();
        paste(text, selected ? [selected.top, selected.left] : anchor.current);
      }}
    >
      <div className={wideTableClass}>
        {/* No text selection while a drag selects cells: the browser would
            otherwise paint one across every box the pointer passes over. */}
        <table className={`border-collapse ${drag ? "select-none" : ""}`}>
          <tbody>
            <tr>
              <td className="p-0.5 text-center">
                <button
                  type="button"
                  tabIndex={-1}
                  className={`${handle} mx-auto size-3`}
                  aria-label="Select the whole table"
                  title="Select the whole table"
                  onMouseDown={keepFocus}
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
                    title={`Select column ${c + 1}. Drag along the bars, or Shift-click one, to select several.`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      if (event.button !== 0) return;
                      if (!event.shiftKey) anchor.current = [0, c];
                      select(columnsTo(c));
                      setDrag("columns");
                    }}
                    onMouseEnter={() => {
                      if (drag === "columns") select(columnsTo(c));
                    }}
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
                    title={`Select row ${r + 1}. Drag along the bars, or Shift-click one, to select several.`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      if (event.button !== 0) return;
                      if (!event.shiftKey) anchor.current = [r, 0];
                      select(rowsTo(r));
                      setDrag("rows");
                    }}
                    onMouseEnter={() => {
                      if (drag === "rows") select(rowsTo(r));
                    }}
                  />
                </td>
                {row.map((cell, c) => {
                  const isHeader = (block.headerRow && r === 0) || (block.headerColumn && c === 0);
                  return (
                    <td
                      key={c}
                      className="border border-slate-200 p-0.5 dark:border-slate-700"
                      onMouseDown={(event) => {
                        // A right-click inside the selection keeps it, so the
                        // menu's Copy and Cut act on the cells.
                        if (event.button !== 0) {
                          if (!inside(r, c)) setRange(null);
                          return;
                        }
                        if (event.shiftKey) {
                          // Kept from the text box, which would otherwise
                          // take the click as the start of a text selection.
                          event.preventDefault();
                          select(cellRange(anchor.current, [r, c]));
                          return;
                        }
                        setRange(null);
                        anchor.current = [r, c];
                        setDrag("cells");
                      }}
                      onMouseEnter={() => {
                        // Only once the pointer reaches another cell does a
                        // drag select cells; until then it selects text.
                        if (drag !== "cells") return;
                        const [ar, ac] = anchor.current;
                        if (ar === r && ac === c) {
                          setRange(null);
                          return;
                        }
                        document.getSelection()?.removeAllRanges();
                        setRange(cellRange(anchor.current, [r, c]));
                        setNote(null);
                      }}
                      onFocus={() => {
                        if (!moving.current && drag === null) anchor.current = [r, c];
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
      {selected && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={small} onMouseDown={keepFocus} onClick={() => viaClipboard("copy")}>Copy</button>
          <button type="button" className={small} onMouseDown={keepFocus} onClick={() => viaClipboard("cut")}>Cut</button>
          <button type="button" className={small} onMouseDown={keepFocus} onClick={() => viaClipboard("paste")}>Paste</button>
          <span className="text-xs text-slate-500 dark:text-slate-400">or Ctrl+C, Ctrl+X, Ctrl+V (Cmd on a Mac)</span>
        </div>
      )}
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
