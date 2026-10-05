/**
 * What the reading view's selection tools do to a rule, as plain string
 * edits: highlight a selection, recolour or remove a highlight, turn a
 * selection into a link, and highlight or clear whole cells of a table. The page maps the reader's selection onto the
 * stored text (`readSelection.ts`); everything that decides what the text
 * becomes lives here, where it can be tested without a browser.
 *
 * One rule runs through all of it: an edit never cuts through markup. A
 * selection that starts or ends inside bold, a link or a gap grows to take
 * the whole of it, and one that cannot be made whole is refused rather than
 * leaving half a marker behind.
 */

import {
  HIGHLIGHT_CODE,
  parseInline,
  parseTextBlock,
  shownWords,
  type HighlightColour,
  type InlineMode,
  type InlineToken,
} from "@/lib/blockText";
import { withCell } from "@/lib/blocks";
import type { Block, TableBlock } from "@/lib/types";

/** Which text in a block: `text`, `cell:<row>:<column>`, `sentence` or `translation`. */
export type Field = string;

/** A selection mapped onto one field's stored text, `start` before `end`. */
export type Selected = { blockId: string; field: Field; start: number; end: number };

/** A selection across cells of one table: the rectangle of whole cells between its corners. */
export type CellSelection = { blockId: string; top: number; left: number; bottom: number; right: number };

export const isCells = (selection: Selected | CellSelection): selection is CellSelection => "top" in selection;

/**
 * One end of a selection, as `readSelection` finds it on the page. The
 * offset is null when the end is in a field but not in its words: in an
 * empty cell, or on a cell's edge, which still names the cell.
 */
export type SelectionPoint = { blockId: string; field: Field; offset: number | null };

/** The words a link would be made of, and where they are; `bold` when they are all of one bold run, whose `**` the range includes. */
export type LinkRange = { start: number; end: number; words: string; bold?: true };

type Highlight = Extract<InlineToken, { kind: "highlight" }>;

function cellOf(field: Field): [number, number] | null {
  const match = /^cell:(\d+):(\d+)$/.exec(field);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

/**
 * Both ends in one field: the words between them. Ends in two cells of one
 * table: the rectangle between those cells, whichever corner the drag began
 * at, which is how a row, a column or the whole table is selected. Anything
 * else, nothing: an edit never spans two blocks or two fields of any other
 * kind.
 */
export function combinePoints(a: SelectionPoint | null, b: SelectionPoint | null): Selected | CellSelection | null {
  if (!a || !b || a.blockId !== b.blockId) return null;
  if (a.field === b.field) {
    if (a.offset === null || b.offset === null || a.offset === b.offset) return null;
    return { blockId: a.blockId, field: a.field, start: Math.min(a.offset, b.offset), end: Math.max(a.offset, b.offset) };
  }
  const from = cellOf(a.field);
  const to = cellOf(b.field);
  if (!from || !to) return null;
  return {
    blockId: a.blockId,
    top: Math.min(from[0], to[0]),
    left: Math.min(from[1], to[1]),
    bottom: Math.max(from[0], to[0]),
    right: Math.max(from[1], to[1]),
  };
}

export function fieldText(block: Block, field: Field): string | null {
  if (block.kind === "text") return field === "text" ? block.text : null;
  if (block.kind === "example") {
    return field === "sentence" ? block.sentence : field === "translation" ? block.translation : null;
  }
  if (!field.startsWith("cell:")) return null;
  const [, r, c] = field.split(":").map(Number);
  return block.cells[r]?.[c] ?? null;
}

export function withFieldText(block: Block, field: Field, value: string): Block {
  if (block.kind === "text") return { ...block, text: value };
  if (block.kind === "example") return field === "sentence" ? { ...block, sentence: value } : { ...block, translation: value };
  const [, r, c] = field.split(":").map(Number);
  return withCell(block, r, c, value);
}

function modeOf(field: Field): InlineMode {
  return field === "sentence" ? "sentence" : field === "translation" ? "plain" : "rich";
}

/** The field's top-level tokens, positioned in the whole field's text. */
function tokensOf(text: string, field: Field): InlineToken[] {
  return field === "text" ? parseTextBlock(text).flatMap((line) => line.tokens) : parseInline(text, modeOf(field));
}

/** Spaces at either end are not part of a selection; a double click often takes one. */
function trim(text: string, start: number, end: number): [number, number] {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return [start, end];
}

const overlaps = (token: { from: number; to: number }, start: number, end: number) => token.from < end && start < token.to;

function highlightsIn(tokens: InlineToken[], start: number, end: number): Highlight[] {
  return tokens.filter((t): t is Highlight => t.kind === "highlight" && overlaps(t, start, end));
}

/**
 * The text with the selection highlighted in `colour`, or null when that
 * cannot be done cleanly. A selection that touches one highlight recolours
 * all of it. One that touches bold, a link or a gap takes the whole of it.
 * Refused: a selection over more than one highlight, words starting or
 * ending with `=` (which reads as though the marker began or closed one
 * character short even where it still parses), and, caught only by the
 * reparse below, anything that would leave the field showing different words
 * than before, such as words holding `==` that closes the marker early or a
 * bullet's `- ` pulled inside it.
 */
export function addHighlight(text: string, field: Field, selected: Selected, colour: HighlightColour): string | null {
  const tokens = tokensOf(text, field);
  let [start, end] = trim(text, selected.start, selected.end);
  if (start === end) return null;

  const touched = highlightsIn(tokens, start, end);
  if (touched.length > 1) return null;
  if (touched.length === 1) {
    const code = touched[0].from + 2;
    const result = text.slice(0, code) + HIGHLIGHT_CODE[colour] + text.slice(code + 1);
    return shownWords(tokensOf(result, field)) === shownWords(tokens) ? result : null;
  }

  for (const token of tokens) {
    if (token.kind !== "text" && overlaps(token, start, end)) {
      start = Math.min(start, token.from);
      end = Math.max(end, token.to);
    }
  }
  const words = text.slice(start, end);
  if (words.startsWith("=") || words.endsWith("=")) return null;
  const result = `${text.slice(0, start)}==${HIGHLIGHT_CODE[colour]}:${words}==${text.slice(end)}`;
  const resultTokens = tokensOf(result, field);
  const madeTheHighlight = resultTokens.some((t) => t.kind === "highlight" && t.from === start && t.to === end + 6);
  return madeTheHighlight && shownWords(resultTokens) === shownWords(tokens) ? result : null;
}

/**
 * The text with every highlight the selection touches taken off, or null
 * when it touches none, or when taking the markers off would change what the
 * field reads as: removing the marker from `==g:*a==*` leaves `*a*`, which
 * reparses as italic rather than the literal star `*a` was shown as inside
 * the highlight, so it is refused the same way an edit that leaves markup
 * broken is refused.
 */
export function removeHighlight(text: string, field: Field, selected: Selected): string | null {
  const tokens = tokensOf(text, field);
  const touched = highlightsIn(tokens, selected.start, selected.end);
  if (touched.length === 0) return null;
  // Last first, so taking one off does not move the ones before it.
  let result = text;
  for (const { from, to } of [...touched].reverse()) {
    result = result.slice(0, from) + result.slice(from + 4, to - 2) + result.slice(to);
  }
  return shownWords(tokensOf(result, field)) === shownWords(tokens) ? result : null;
}

/**
 * The words a link would be made of, when the selection lies within plain
 * words of a text block or a table cell, or within one bold run, or null.
 * A bold run is taken whole, as a highlight takes it, and becomes a bold
 * link: an edit never cuts through markup, and a header cell is often all
 * bold. Not across a link, italic or a line break, and not holding a
 * bracket, which would end the link early. Inside a highlight is fine: the
 * link then sits inside it. Examples take no links.
 */
export function linkRange(text: string, field: Field, selected: Selected): LinkRange | null {
  if (modeOf(field) !== "rich") return null;
  const [start, end] = trim(text, selected.start, selected.end);
  if (start === end) return null;
  const leaves = tokensOf(text, field).flatMap((t) => (t.kind === "highlight" ? t.tokens : [t]));
  const home = leaves.find((t) => t.from <= start && end <= t.to);
  if (home?.kind === "bold") {
    const words = home.value.trim();
    return !words || /[[\]]/.test(words) ? null : { start: home.from, end: home.to, words, bold: true };
  }
  if (!home || home.kind !== "text") return null;
  const words = text.slice(start, end);
  return /[[\]\n]/.test(words) ? null : { start, end, words };
}

/** True when the text still holds the range's words where they were found, markers and all. */
export function rangeHolds(text: string, range: LinkRange): boolean {
  return text.slice(range.start, range.end) === (range.bold ? `**${range.words}**` : range.words);
}

/**
 * The selection replaced by a link to `name`, keeping the words as the
 * reader wrote them: `[[name]]` when they are exactly the name, else
 * `[[name|words]]`. Exactly, not folded, since "dativ" linked to "Dativ"
 * would otherwise start showing a capital it was not written with.
 */
export function applyLink(text: string, range: LinkRange, name: string): string {
  const bare = range.words === name ? `[[${name}]]` : `[[${name}|${range.words}]]`;
  const link = range.bold ? `**${bare}**` : bare;
  return text.slice(0, range.start) + link + text.slice(range.end);
}

/** The whole of a cell's text, as a selection, for the edits above. */
const whole = (text: string): Selected => ({ blockId: "", field: "cell", start: 0, end: text.length });

/** The table with `edit` applied to every cell in the rectangle, or null when no cell changed. */
function editCells(table: TableBlock, cells: CellSelection, edit: (text: string) => string | null): TableBlock | null {
  let changed = false;
  const next = table.cells.map((row, r) =>
    row.map((text, c) => {
      if (r < cells.top || r > cells.bottom || c < cells.left || c > cells.right) return text;
      const edited = edit(text);
      if (edited === null || edited === text) return text;
      changed = true;
      return edited;
    }),
  );
  return changed ? { ...table, cells: next } : null;
}

/**
 * Every cell in the rectangle highlighted whole in `colour`, any highlight
 * already in it giving way to the one around all of it. A cell that is empty,
 * or whose words would break the marker, is left as it is rather than
 * refusing the whole selection over one cell.
 */
export function highlightCells(table: TableBlock, cells: CellSelection, colour: HighlightColour): TableBlock | null {
  return editCells(table, cells, (text) => {
    const bare = removeHighlight(text, "cell", whole(text)) ?? text;
    return addHighlight(bare, "cell", whole(bare), colour);
  });
}

/** Every highlight in the rectangle taken off, or null when there was none. */
export function unhighlightCells(table: TableBlock, cells: CellSelection): TableBlock | null {
  return editCells(table, cells, (text) => removeHighlight(text, "cell", whole(text)));
}
