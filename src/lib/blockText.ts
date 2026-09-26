/**
 * The markup a text block accepts, and nothing more:
 *
 *   **bold**   *italic*   [[Name]] links   lines starting with "- " as bullets
 *
 * Rendered by the app's own code rather than a markdown library, because this
 * set does not justify one. The one rule that matters is that anything the
 * parser does not recognise, including markup that is never closed, comes out
 * as the characters typed: a star left open must not swallow a paragraph.
 */

export type InlineToken =
  | { kind: "text"; value: string }
  | { kind: "bold"; value: string }
  | { kind: "italic"; value: string }
  /** A name, resolved against the link index when shown; see `RefText`. */
  | { kind: "link"; name: string };

export type TextLine = { kind: "paragraph" | "bullet"; tokens: InlineToken[] };

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

function pushText(tokens: InlineToken[], value: string): void {
  if (!value) return;
  const last = tokens[tokens.length - 1];
  if (last && last.kind === "text") last.value += value;
  else tokens.push({ kind: "text", value });
}

export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  text.split(LINK).forEach((segment, i) => {
    if (!segment) return;
    // `String.split` with a capturing pattern alternates plain text and the
    // matched groups themselves, so the item at an odd index is exactly what
    // LINK or EMPHASIS matched already; testing it again, as this used to,
    // could only ever repeat the same answer the split had already given.
    if (i % 2 === 1) {
      const name = segment.slice(2, -2).trim();
      if (name) tokens.push({ kind: "link", name });
      else pushText(tokens, segment);
      return;
    }
    segment.split(EMPHASIS).forEach((part, j) => {
      if (!part) return;
      if (j % 2 !== 1) {
        pushText(tokens, part);
      } else if (part.startsWith("**")) {
        tokens.push({ kind: "bold", value: part.slice(2, -2) });
      } else {
        tokens.push({ kind: "italic", value: part.slice(1, -1) });
      }
    });
  });
  return tokens;
}

/**
 * Lines become paragraphs, a line starting with "- " becomes a bullet, and
 * blank lines are dropped: each line is already its own block on screen, so
 * an empty one would only be a gap.
 */
export function parseTextBlock(text: string): TextLine[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) =>
      line.startsWith("- ")
        ? { kind: "bullet", tokens: parseInline(line.slice(2)) }
        : { kind: "paragraph", tokens: parseInline(line) },
    );
}

/** The gaps in an example, `{dem}`, split out from the words around them. */
export function splitGaps(sentence: string): { value: string; gap: boolean }[] {
  const parts: { value: string; gap: boolean }[] = [];
  for (const segment of sentence.split(/(\{[^{}\n]+\})/)) {
    if (!segment) continue;
    if (segment.startsWith("{") && segment.endsWith("}") && segment.length > 2) {
      parts.push({ value: segment.slice(1, -1), gap: true });
    } else {
      const last = parts[parts.length - 1];
      if (last && !last.gap) last.value += segment;
      else parts.push({ value: segment, gap: false });
    }
  }
  return parts;
}

/** The words without their markup, for a spreadsheet cell or a search. */
export function plainText(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      parseInline(line)
        .map((token) => (token.kind === "link" ? token.name : token.value))
        .join(""),
    )
    .join("\n")
    .replace(/\{([^{}\n]+)\}/g, "$1");
}
