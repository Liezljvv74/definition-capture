"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { SelectionToolbar } from "@/components/grammar/SelectionToolbar";
import { readSelection } from "@/components/grammar/readSelection";
import { HIGHLIGHT_COLOURS, type HighlightColour } from "@/lib/blockText";
import { updateRule } from "@/lib/rules";
import {
  addHighlight,
  fieldText,
  highlightCells,
  isCells,
  removeHighlight,
  unhighlightCells,
  withFieldText,
  type CellSelection,
  type Selected,
} from "@/lib/selectionEdits";
import type { Block, Rule } from "@/lib/types";

/** A box in this component's own coordinates. */
type Box = { top: number; left: number; width: number; height: number };

/**
 * The selection, where its toolbar goes, and, for a selection across cells,
 * the outline drawn round them.
 */
type Shown = { selected: Selected | CellSelection; top: number; left: number; outline: Box | null };

/**
 * The reading view's tools: select words in a rule, or drag across cells of
 * a table, and a toolbar below the selection highlights them. Every change
 * is an ordinary save of the rule through `updateRule`, the same as Edit's
 * Save, so it is optimistic and a failure is reported in the banner like any
 * other.
 */
export function ReadingTools({ rule, children }: { rule: Rule; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    const onChange = () => {
      const box = root.current;
      const found = box ? readSelection(box) : null;
      if (!box || !found) {
        setShown(null);
        return;
      }
      const frame = box.getBoundingClientRect();
      const outline = isCells(found.selected) ? cellsBox(box, found.selected, frame) : null;
      const below = outline ? outline.top + outline.height : found.rect.bottom - frame.top;
      const from = outline ? outline.left : found.rect.left - frame.left;
      setShown({
        selected: found.selected,
        outline,
        top: below + 8,
        // ponytail: a fixed allowance for the toolbar's width keeps it inside the card near the right edge; measure the toolbar if it ever grows.
        left: Math.max(0, Math.min(from, frame.width - 280)),
      });
    };
    document.addEventListener("selectionchange", onChange);
    return () => document.removeEventListener("selectionchange", onChange);
  }, []);

  function saveBlock(changed: Block) {
    const blocks = rule.blocks.map((block) => (block.id === changed.id ? changed : block));
    updateRule(rule.id, { title: rule.title, topic: rule.topic, blocks });
    document.getSelection()?.removeAllRanges();
    setShown(null);
  }

  const selected = shown?.selected;
  const block = selected ? rule.blocks.find((candidate) => candidate.id === selected.blockId) : undefined;

  let onHighlight: ((colour: HighlightColour) => void) | null = null;
  let onRemove: (() => void) | null = null;

  if (selected && block) {
    if (isCells(selected)) {
      if (block.kind === "table") {
        // Offered when some colour would change some cell: a column already
        // all green still offers the others.
        if (HIGHLIGHT_COLOURS.some((colour) => highlightCells(block, selected, colour) !== null)) {
          onHighlight = (colour) => {
            const next = highlightCells(block, selected, colour);
            if (next) saveBlock(next);
          };
        }
        const cleared = unhighlightCells(block, selected);
        if (cleared) onRemove = () => saveBlock(cleared);
      }
    } else {
      const text = fieldText(block, selected.field);
      if (text !== null) {
        if (addHighlight(text, selected.field, selected, "yellow") !== null) {
          onHighlight = (colour) => {
            const next = addHighlight(text, selected.field, selected, colour);
            if (next !== null) saveBlock(withFieldText(block, selected.field, next));
          };
        }
        const removed = removeHighlight(text, selected.field, selected);
        if (removed !== null) onRemove = () => saveBlock(withFieldText(block, selected.field, removed));
      }
    }
  }

  return (
    // While cells are selected the browser's own selection colour is hidden:
    // it runs in reading order, row by row, and for a column would light up
    // cells outside it. The outline shows what is selected instead.
    <div ref={root} className={`relative ${shown?.outline ? "selection:bg-transparent" : ""}`}>
      {children}
      {shown?.outline && (
        <div
          aria-hidden="true"
          style={shown.outline}
          className="pointer-events-none absolute rounded-sm bg-indigo-500/10 ring-2 ring-indigo-500 dark:ring-indigo-400"
        />
      )}
      {shown && (onHighlight || onRemove) && (
        <SelectionToolbar
          top={shown.top}
          left={shown.left}
          onHighlight={onHighlight}
          onRemove={onRemove}
          onLink={null}
          onNewRule={null}
        />
      )}
    </div>
  );
}

/** The box round the rectangle's two corner cells, which bound every cell between. */
function cellsBox(root: HTMLElement, cells: CellSelection, frame: DOMRect): Box | null {
  const table = root.querySelector(`[data-block="${CSS.escape(cells.blockId)}"]`);
  const first = table?.querySelector(`[data-field="cell:${cells.top}:${cells.left}"]`)?.getBoundingClientRect();
  const last = table?.querySelector(`[data-field="cell:${cells.bottom}:${cells.right}"]`)?.getBoundingClientRect();
  if (!first || !last) return null;
  return { top: first.top - frame.top, left: first.left - frame.left, width: last.right - first.left, height: last.bottom - first.top };
}
