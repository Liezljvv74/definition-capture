import { combinePoints, type CellSelection, type Selected, type SelectionPoint } from "@/lib/selectionEdits";

/**
 * The reader's selection in a rule's reading view, as offsets into one
 * field's stored text, or null. It reads the attributes `BlockView` and
 * `RichText` put on the page: `data-block`, `data-field`, and `data-at` on
 * every element that shows words, which holds one text node whose first
 * character sits at that offset. Nothing here decides what an edit does;
 * that is `selectionEdits.ts`.
 */
export function readSelection(root: HTMLElement): { selected: Selected | CellSelection; rect: DOMRect } | null {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  const selected = combinePoints(
    pointAt(range.startContainer, range.startOffset, root, "start"),
    pointAt(range.endContainer, range.endOffset, root, "end"),
  );
  return selected ? { selected, rect: range.getBoundingClientRect() } : null;
}

/**
 * A selection can end on an element rather than in text, between two of its
 * children, as a triple click does. Such an end moves to the nearest text:
 * the start of the child after it, or the end of the child before it.
 */
function textPoint(node: Node, offset: number, side: "start" | "end"): [Text, number] | null {
  if (node.nodeType === Node.TEXT_NODE) return [node as Text, offset];
  const child = side === "start" ? node.childNodes[offset] : node.childNodes[offset - 1];
  if (!child) return null;
  if (child.nodeType === Node.TEXT_NODE) return [child as Text, side === "start" ? 0 : (child as Text).length];
  const walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT);
  if (side === "start") {
    const first = walker.nextNode() as Text | null;
    return first ? [first, 0] : null;
  }
  let last: Text | null = null;
  for (let next = walker.nextNode(); next; next = walker.nextNode()) last = next as Text;
  return last ? [last, last.length] : null;
}

/** The element an end sits in, or, when it sits between children, the child on its side. */
function elementAt(node: Node, offset: number, side: "start" | "end"): Element | null {
  if (node.nodeType === Node.TEXT_NODE) return node.parentElement;
  const child = node.childNodes[side === "start" ? offset : offset - 1];
  if (child instanceof Element) return child;
  return child ? child.parentElement : node instanceof Element ? node : null;
}

/**
 * The field an end is in, and where in its words. An end in an empty cell,
 * or on a cell's edge, has no words to be in, but still names its cell: a
 * selection from one cell to another needs only the cells, and a header
 * corner is often empty.
 */
function pointAt(node: Node, offset: number, root: HTMLElement, side: "start" | "end"): SelectionPoint | null {
  const field = elementAt(node, offset, side)?.closest<HTMLElement>("[data-field]");
  const block = field?.closest<HTMLElement>("[data-block]");
  if (!field || !block || !root.contains(block)) return null;
  const found = textPoint(node, offset, side);
  const leaf = found?.[0].parentElement?.closest<HTMLElement>("[data-at]");
  const inWords = Boolean(found && leaf && field.contains(leaf));
  return {
    blockId: block.dataset.block ?? "",
    field: field.dataset.field ?? "",
    offset: inWords && found && leaf ? Number(leaf.dataset.at) + found[1] : null,
  };
}
