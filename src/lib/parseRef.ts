/**
 * The Ref field is free text that quietly turns recognisable references into
 * links. Nothing is required — plain notes stay plain.
 *
 *   [[Closure]]                 → the term called "Closure"
 *   /word?id=abc123, /          → a page inside this app
 *   https://example.com/docs    → any web page, opened in a new tab
 *   #definition                 → a spot on the page you are already on
 *
 * These can be mixed freely with ordinary words in one field.
 */

export type RefToken =
  | { kind: "text"; value: string }
  /** A term by name; resolved to an id at render time. */
  | { kind: "word"; name: string }
  | { kind: "url"; href: string; label: string }
  | { kind: "internal"; href: string; label: string }
  | { kind: "anchor"; href: string; label: string };

/** Splits on [[…]] while keeping the delimiters, so term links survive. */
const TERM_LINK = /(\[\[[^[\]\n]+\]\])/g;

/**
 * The same rule as `TERM_LINK`, anchored, for checking a whole segment.
 *
 * It exists because testing `startsWith("[[")` instead was looser than the
 * pattern that does the splitting: `[[a[b]]` never matches `TERM_LINK`, so it
 * arrives as one unsplit segment, and the loose check then read it as a term
 * named `a[b` — a name `TERM_LINK` cannot produce and no `[[Name]]` the
 * autocomplete writes will ever resolve to. Two spellings of one rule is how
 * they drift; this is the one rule.
 */
const TERM_LINK_ONLY = /^\[\[[^[\]\n]+\]\]$/;

/** Brackets and quotes that wrap a link rather than belonging to it. */
const LEADING_PUNCTUATION = /^[([{'"]+/;

/** Punctuation that ends a sentence rather than belonging to the link. */
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

function appendText(tokens: RefToken[], value: string): void {
  const last = tokens[tokens.length - 1];
  if (last && last.kind === "text") last.value += value;
  else tokens.push({ kind: "text", value });
}

function classify(word: string): RefToken | null {
  if (/^https?:\/\/\S+$/i.test(word)) {
    // Drop the scheme for display; a bare host reads better in a narrow column.
    return { kind: "url", href: word, label: word.replace(/^https?:\/\//i, "") };
  }
  if (/^www\.\S+\.\S+$/i.test(word)) {
    return { kind: "url", href: `https://${word}`, label: word };
  }
  // One slash, and not a backslash behind it. `//evil.com` is protocol-
  // relative and leaves the site, but would otherwise read as an internal path
  // and be rendered as a same-tab link with no `rel="noopener"`. `/\evil.com`
  // is the same attack wearing a different hat: browsers fold `\` to `/` for
  // http(s) URLs, so it resolves off-site too while sailing past a guard that
  // only looks for a second slash.
  if (/^\/(?![/\\])\S*$/.test(word)) {
    return { kind: "internal", href: word, label: word };
  }
  if (/^#[^\s#]+$/.test(word)) {
    return { kind: "anchor", href: word, label: word };
  }
  return null;
}

export function parseRef(text: string): RefToken[] {
  const tokens: RefToken[] = [];
  if (!text) return tokens;

  for (const segment of text.split(TERM_LINK)) {
    if (!segment) continue;

    if (TERM_LINK_ONLY.test(segment)) {
      const name = segment.slice(2, -2).trim();
      if (name) tokens.push({ kind: "word", name });
      else appendText(tokens, segment);
      continue;
    }

    // Split on whitespace but keep it, so the original spacing is preserved.
    for (const part of segment.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        appendText(tokens, part);
        continue;
      }

      // Peel any wrapping punctuation off before deciding what the word is,
      // so "(https://example.com)." still links the URL in the middle.
      const leading = LEADING_PUNCTUATION.exec(part)?.[0] ?? "";
      const unwrapped = part.slice(leading.length);
      const trailing = TRAILING_PUNCTUATION.exec(unwrapped)?.[0] ?? "";
      const word = trailing ? unwrapped.slice(0, -trailing.length) : unwrapped;
      const token = word ? classify(word) : null;

      if (token) {
        if (leading) appendText(tokens, leading);
        tokens.push(token);
        if (trailing) appendText(tokens, trailing);
      } else {
        appendText(tokens, part);
      }
    }
  }

  return tokens;
}

