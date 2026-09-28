/**
 * The markup a rule's text accepts, and nothing more:
 *
 *   **bold**   *italic*   [[Name]] or [[Name|shown words]] links
 *   ==y:highlighted words==  (y yellow, g green, b blue, p purple)
 *   lines starting with "- " as bullets   {gap} in an example sentence
 *
 * Rendered by the app's own code rather than a markdown library, because this
 * set does not justify one. The one rule that matters is that anything the
 * parser does not recognise, including markup that is never closed, comes out
 * as the characters typed: a star left open must not swallow a paragraph.
 *
 * Every token records where it sits in the text it came from: `from` and `to`
 * span its markup, and a token that shows words records in `at` where those
 * words start. That is what lets a selection made on the rendered page be
 * mapped back onto the text to highlight or link it (`selectionEdits.ts`),
 * without the stored text carrying offsets that editing would make drift.
 */

import { linkParts } from "@/lib/links";

export type HighlightColour = "yellow" | "green" | "blue" | "purple";

/** The letter a colour is written as, `==y:…==`. One letter, since Edit mode shows it. */
export const HIGHLIGHT_CODE: Record<HighlightColour, string> = { yellow: "y", green: "g", blue: "b", purple: "p" };
const COLOUR_BY_CODE: Record<string, HighlightColour> = { y: "yellow", g: "green", b: "blue", p: "purple" };
/** Every colour, in the order the toolbar offers them. */
export const HIGHLIGHT_COLOURS = Object.keys(HIGHLIGHT_CODE) as HighlightColour[];

type Span = { from: number; to: number };

export type InlineToken =
  | ({ kind: "text"; value: string; at: number } & Span)
  | ({ kind: "bold"; value: string; at: number } & Span)
  | ({ kind: "italic"; value: string; at: number } & Span)
  /** A name, resolved against the link index when shown; see `RefText`. */
  | ({ kind: "link"; name: string; label?: string; at: number } & Span)
  /** A word practice will blank out, `{dem}`; only in an example sentence. */
  | ({ kind: "gap"; value: string; at: number } & Span)
  | ({ kind: "highlight"; colour: HighlightColour; tokens: InlineToken[] } & Span);

/** A token that shows words of its own, as opposed to a highlight around others. */
export type LeafToken = Exclude<InlineToken, { kind: "highlight" }>;

export type TextLine = { kind: "paragraph" | "bullet"; tokens: InlineToken[] };

/**
 * What a field accepts. `rich` is a text block or a table cell; `sentence` is
 * an example's sentence, which has gaps and, as before, no links or
 * emphasis; `plain` is its translation. All three take highlights.
 */
export type InlineMode = "rich" | "sentence" | "plain";

/**
 * The same shape as `NAME_LINK` in `parseRef.ts`: a link never spans a line
 * and never holds a bracket. Kept as its own copy because that module also
 * turns bare URLs into links, which a passage of grammar must not do to
 * every slash it contains.
 */
const LINK = /(\[\[[^[\]\n]+\]\])/;
/**
 * Bold before italic, so `**` is not read as an empty italic pair. An italic
 * run may not start or end with a space, so a lone star in "2 * 3 * 4" is
 * arithmetic rather than markup.
 */
const EMPHASIS = /(\*\*[^*\n]+\*\*|\*[^*\s\n](?:[^*\n]*[^*\s\n])?\*)/;
const GAP = /(\{[^{}\n]+\})/;
/**
 * `==y:words==`: never across a line, never empty, never nested, and closed
 * by the first `==` after it opens. Read before anything else, so a highlight
 * can hold bold, a link or a gap, which are read inside it.
 */
const HIGHLIGHT = /(==[ygbp]:(?:(?!==)[^\n])+==)/;

/** The words a leaf shows: a link's label if it has one, else its name. */
export function shownText(token: LeafToken): string {
  return token.kind === "link" ? token.label || token.name : token.value;
}

/**
 * `String.split` with a one-group pattern, each piece with where it starts.
 * The split alternates plain text and matches, so a piece at an odd index is
 * exactly what the pattern matched, and needs no second test.
 */
function pieces(text: string, pattern: RegExp, base: number): { value: string; at: number; match: boolean }[] {
  let at = base;
  return text.split(pattern).map((value, i) => {
    const piece = { value, at, match: i % 2 === 1 };
    at += value.length;
    return piece;
  });
}

function pushText(tokens: InlineToken[], value: string, at: number): void {
  if (!value) return;
  const last = tokens[tokens.length - 1];
  if (last && last.kind === "text" && last.to === at) {
    last.value += value;
    last.to += value.length;
  } else {
    tokens.push({ kind: "text", value, at, from: at, to: at + value.length });
  }
}

/** One line of a field, with `base` the offset of its first character in the whole field. */
export function parseInline(text: string, mode: InlineMode = "rich", base = 0): InlineToken[] {
  const tokens: InlineToken[] = [];
  for (const piece of pieces(text, HIGHLIGHT, base)) {
    if (!piece.value) continue;
    if (piece.match) {
      tokens.push({
        kind: "highlight",
        colour: COLOUR_BY_CODE[piece.value[2]],
        tokens: parseMarkup(piece.value.slice(4, -2), mode, piece.at + 4, []),
        from: piece.at,
        to: piece.at + piece.value.length,
      });
    } else {
      parseMarkup(piece.value, mode, piece.at, tokens);
    }
  }
  return tokens;
}

/** Everything but highlights, appended to `tokens`. */
function parseMarkup(text: string, mode: InlineMode, base: number, tokens: InlineToken[]): InlineToken[] {
  if (mode === "plain") {
    pushText(tokens, text, base);
    return tokens;
  }
  for (const piece of pieces(text, mode === "sentence" ? GAP : LINK, base)) {
    if (!piece.value) continue;
    const to = piece.at + piece.value.length;
    if (piece.match && mode === "sentence") {
      tokens.push({ kind: "gap", value: piece.value.slice(1, -1), at: piece.at + 1, from: piece.at, to });
    } else if (piece.match) {
      const inner = piece.value.slice(2, -2);
      const { name, label } = linkParts(inner);
      // The shown words start where the trimmed label or name does, which
      // `indexOf` finds: only spaces stand before them in their part.
      if (!name) pushText(tokens, piece.value, piece.at);
      else if (label) tokens.push({ kind: "link", name, label, at: piece.at + 2 + inner.indexOf(label, inner.indexOf("|") + 1), from: piece.at, to });
      else tokens.push({ kind: "link", name, at: piece.at + 2 + inner.indexOf(name), from: piece.at, to });
    } else if (mode === "sentence") {
      pushText(tokens, piece.value, piece.at);
    } else {
      for (const part of pieces(piece.value, EMPHASIS, piece.at)) {
        if (!part.value) continue;
        const end = part.at + part.value.length;
        if (!part.match) pushText(tokens, part.value, part.at);
        else if (part.value.startsWith("**")) tokens.push({ kind: "bold", value: part.value.slice(2, -2), at: part.at + 2, from: part.at, to: end });
        else tokens.push({ kind: "italic", value: part.value.slice(1, -1), at: part.at + 1, from: part.at, to: end });
      }
    }
  }
  return tokens;
}

/**
 * Lines become paragraphs, a line starting with "- " becomes a bullet, and
 * blank lines are dropped: each line is already its own block on screen, so
 * an empty one would only be a gap. Offsets count from the start of the
 * whole text, so a selection on any line maps onto the block's one string.
 */
export function parseTextBlock(text: string): TextLine[] {
  const lines: TextLine[] = [];
  let start = 0;
  for (const line of text.split("\n")) {
    if (line.trim() !== "") {
      lines.push(
        line.startsWith("- ")
          ? { kind: "bullet", tokens: parseInline(line.slice(2), "rich", start + 2) }
          : { kind: "paragraph", tokens: parseInline(line, "rich", start) },
      );
    }
    start += line.length + 1;
  }
  return lines;
}

/**
 * The text cut at its highlights' markers, every character kept, for Edit
 * mode, which shows the markers faintly and tints what they hold. The whole
 * text at once: a highlight never crosses a line, so lines need no splitting.
 */
export function highlightRuns(text: string): { text: string; marker?: true; colour?: HighlightColour }[] {
  return text.split(HIGHLIGHT).flatMap((piece, i) => {
    if (!piece) return [];
    if (i % 2 === 0) return [{ text: piece }];
    return [
      { text: piece.slice(0, 4), marker: true as const },
      { text: piece.slice(4, -2), colour: COLOUR_BY_CODE[piece[2]] },
      { text: "==", marker: true as const },
    ];
  });
}

function shown(tokens: InlineToken[]): string {
  return tokens.map((t) => (t.kind === "highlight" ? shown(t.tokens) : shownText(t))).join("");
}

/** The words without their markup, for a spreadsheet cell or a search. */
export function plainText(text: string): string {
  return text
    .split("\n")
    .map((line) => shown(parseInline(line)))
    .join("\n")
    .replace(/\{([^{}\n]+)\}/g, "$1");
}
