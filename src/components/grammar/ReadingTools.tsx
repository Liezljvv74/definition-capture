"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { AddRuleDialog } from "@/components/grammar/AddRuleDialog";
import { LinkToDialog } from "@/components/grammar/LinkToDialog";
import { SelectionToolbar } from "@/components/grammar/SelectionToolbar";
import { readSelection } from "@/components/grammar/readSelection";
import { HIGHLIGHT_COLOURS, type HighlightColour } from "@/lib/blockText";
import { updateRule } from "@/lib/rules";
import {
  addHighlight,
  applyLink,
  fieldText,
  highlightCells,
  isCells,
  linkRange,
  removeHighlight,
  unhighlightCells,
  withFieldText,
  type CellSelection,
  type LinkRange,
  type Selected,
} from "@/lib/selectionEdits";
import type { Block, Rule } from "@/lib/types";
import { useLinkTargets } from "@/lib/useLinkTargets";
import { useRules } from "@/lib/useRules";
import { useSettings } from "@/lib/useSettings";

/** A box in this component's own coordinates. */
type Box = { top: number; left: number; width: number; height: number };

/**
 * The selection, where its toolbar goes, and, for a selection across cells,
 * the outline drawn round them.
 */
type Shown = { selected: Selected | CellSelection; top: number; left: number; outline: Box | null };

/**
 * The reading view's tools: select words in a rule, or drag across cells of
 * a table, and a toolbar below the selection highlights them, and Link to…
 * and New rule from this turn them into a link. Every change is an ordinary
 * save of the rule through `updateRule`, the same as Edit's Save, so it is
 * optimistic and a failure is reported in the banner like any other.
 */
export function ReadingTools({ rule, children }: { rule: Rule; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const { targets } = useLinkTargets();
  const { rules } = useRules();
  const { settings } = useSettings();
  /**
   * Held apart from `shown` because opening a dialog moves focus, which
   * clears the page's selection and with it `shown`; the dialog still needs
   * to know what was selected.
   */
  const [dialog, setDialog] = useState<{ kind: "link" | "rule"; selected: Selected; range: LinkRange } | null>(null);

  useEffect(() => {
    const onChange = () => {
      const box = root.current;
      const found = box ? readSelection(box) : null;
      if (!box || !found) {
        setShown(null);
        return;
      }
      const frame = box.getBoundingClientRect();
      // ponytail: the outline is measured only on selectionchange, so scrolling a wide table sideways or resizing the window leaves it stranded until the selection next changes; add scroll and resize listeners if that turns out to matter.
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

  /**
   * Applies a link chosen from either dialog. Looked up by id rather than
   * closed over, because the block a dialog was opened against may have
   * changed (or gone) by the time the reader picks a name or finishes
   * writing a new rule. The range's offsets were measured against the text
   * as it stood when the dialog opened; writing a new rule can take a while,
   * so the field is checked to still hold those exact words at those exact
   * offsets before splicing the link in, rather than risk cutting into text
   * that has since shifted underneath them.
   */
  function link(chosen: { selected: Selected; range: LinkRange }, name: string) {
    const target = rule.blocks.find((candidate) => candidate.id === chosen.selected.blockId);
    const current = target ? fieldText(target, chosen.selected.field) : null;
    if (target && current !== null && current.slice(chosen.range.start, chosen.range.end) === chosen.range.words) {
      saveBlock(withFieldText(target, chosen.selected.field, applyLink(current, chosen.range, name)));
    }
  }

  const selected = shown?.selected;
  const block = selected ? rule.blocks.find((candidate) => candidate.id === selected.blockId) : undefined;

  let onHighlight: ((colour: HighlightColour) => void) | null = null;
  let onRemove: (() => void) | null = null;
  let onLink: (() => void) | null = null;
  let onNewRule: (() => void) | null = null;

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
            // Pressing the colour a highlight already has returns the same
            // text: saving it anyway would move the rule's Edited date for a
            // change that never happened.
            if (next !== null && next !== text) saveBlock(withFieldText(block, selected.field, next));
          };
        }
        const removed = removeHighlight(text, selected.field, selected);
        if (removed !== null) onRemove = () => saveBlock(withFieldText(block, selected.field, removed));

        // A selection across cells offers neither: a link and a new rule both
        // need one contiguous run of plain words, which a rectangle of cells
        // is not.
        const range = linkRange(text, selected.field, selected);
        if (range) {
          onLink = () => setDialog({ kind: "link", selected, range });
          onNewRule = () => setDialog({ kind: "rule", selected, range });
        }
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
      {shown && (onHighlight || onRemove || onLink || onNewRule) && (
        <SelectionToolbar
          top={shown.top}
          left={shown.left}
          onHighlight={onHighlight}
          onRemove={onRemove}
          onLink={onLink}
          onNewRule={onNewRule}
        />
      )}
      {dialog?.kind === "link" && (
        <LinkToDialog
          targets={targets}
          rules={rules}
          words={dialog.range.words}
          selfTitle={rule.title}
          onPick={(name) => {
            link(dialog, name);
            setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "rule" && (
        <AddRuleDialog
          topics={settings.topics}
          initialTitle={dialog.range.words}
          initialTopic={rule.topic}
          onCreated={(created) => link(dialog, created.title)}
          onClose={() => setDialog(null)}
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
