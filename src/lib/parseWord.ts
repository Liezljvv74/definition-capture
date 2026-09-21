/**
 * Light auto-population for the Word field.
 *
 * Pasting or typing something shaped like "word: definition" or "word - definition"
 * splits into the two fields. Anything else is left exactly as entered.
 */

export type SplitWord = { word: string; definition: string };

/** A colon, or a dash (hyphen, en dash, em dash) with whitespace around it. */
const SEPARATOR = /:|\s[-–—]\s/;

/** Longer than this and the leading text is prose, not a word. */
const MAX_WORD_LENGTH = 80;

export function splitWordAndDefinition(text: string): SplitWord | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const match = SEPARATOR.exec(trimmed);
  if (!match || match.index === undefined) return null;

  // Don't mangle a pasted URL ("https://…") on its colon.
  if (trimmed.slice(match.index).startsWith("://")) return null;

  const word = trimmed.slice(0, match.index).trim();
  const definition = trimmed.slice(match.index + match[0].length).trim();

  if (!word || !definition) return null;
  if (word.length > MAX_WORD_LENGTH) return null;

  return { word, definition };
}
