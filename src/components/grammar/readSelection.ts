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
  const [endNode, endOffset] = endPoint(range, root);
  const selected = combinePoints(
    pointAt(range.startContainer, range.startOffset, root, "start"),
    pointAt(endNode, endOffset, root, "end"),
  );
  return selected ? { selected, rect: range.getBoundingClientRect() } : null;
}

/**
 * A triple click's end lands differently in each browser. Firefox reports it
 * as `(paragraph, childCount)`, between the paragraph's own children, which
 * `textPoint` below already reads correctly. Chromium instead reports offset
 * 0 of whatever comes next in the tree: the following paragraph, the next
 * block's wrapping `div`, an example's `translation` when the selection was
 * its `sentence`, or an ancestor outside `root` entirely when the paragraph
 * was a block's last child. All of those read as "no words", so a selection
 * that plainly ended mid-sentence would otherwise map to nothing. When the
 * end is an element at offset 0 that still has words in it, an empty cell
 * must not be pulled into the element before it, so it is left alone. The fix
 * is to walk back to the end of the text node just before that offset.
 */
function endPoint(range: Range, root: HTMLElement): [Node, number] {
  const { endContainer, endOffset } = range;
  if (endContainer.nodeType === Node.ELEMENT_NODE && endOffset === 0 && (endContainer.textContent ?? "") !== "") {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    walker.currentNode = endContainer;
    const prev = walker.previousNode() as Text | null;
    if (prev) return [prev, prev.length];
  }
  return [endContainer, endOffset];
}

/**
 * An end that reaches here can still sit on an element rather than in text,
 * between two of its children, as Firefox's own triple click reports it.
 * Such an end moves to the nearest text: the start of the child after it, or
 * the end of the child before it.
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
  return {
    blockId: block.dataset.block ?? "",
    field: field.dataset.field ?? "",
    offset: found && leaf && field.contains(leaf) ? Number(leaf.dataset.at) + found[1] : null,
  };
}
