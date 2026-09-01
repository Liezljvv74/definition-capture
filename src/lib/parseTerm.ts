/**
 * Light auto-population for the Term field.
 *
 * Pasting or typing something shaped like "term: definition" or "term - definition"
 * splits into the two fields. Anything else is left exactly as entered.
 */

export type SplitTerm = { term: string; definition: string };

/** A colon, or a dash (hyphen, en dash, em dash) with whitespace around it. */
const SEPARATOR = /:|\s[-–—]\s/;

/** Longer than this and the leading text is prose, not a term. */
const MAX_TERM_LENGTH = 80;

export function splitTermAndDefinition(text: string): SplitTerm | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const match = SEPARATOR.exec(trimmed);
  if (!match || match.index === undefined) return null;

  // Don't mangle a pasted URL ("https://…") on its colon.
  if (trimmed.slice(match.index).startsWith("://")) return null;

  const term = trimmed.slice(0, match.index).trim();
  const definition = trimmed.slice(match.index + match[0].length).trim();

  if (!term || !definition) return null;
  if (term.length > MAX_TERM_LENGTH) return null;

  return { term, definition };
}
