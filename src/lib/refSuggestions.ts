/**
 * The lookup behind the Ref field's autocomplete. Ref stays free text — this
 * only offers the `[[Name]]` form of an internal link while you are typing a
 * name, and never rewrites anything on its own.
 *
 * Terms and phrases share one namespace here, exactly as they do in
 * `buildLinkIndex`: a Ref written in either form can point at either list, so
 * both forms offer both lists.
 */

import type { Entry, Phrase } from "@/lib/types";

export type RefSuggestion = {
  name: string;
  kind: "term" | "phrase";
};

/** The stretch of the field a completion would replace. */
export type RefQuery = {
  /** Index of the first character of the word the caret sits in. */
  start: number;
  /** Index just past its last character. */
  end: number;
  /** What has been typed so far, from `start` up to the caret. */
  text: string;
};

/** How many names the dropdown shows before it starts scrolling. */
const SUGGESTION_LIMIT = 8;

/**
 * Anything with a scheme, a `www.` start, or a bare `host/path`. Note what is
 * deliberately *not* here: a bare dotted word. `Node.js` is a plausible term
 * name, and treating it as a domain would silently switch the suggestions off
 * for it.
 */
const URL_LIKE = [
  /^https?/i,
  /^www/i,
  /^[a-z][a-z0-9+.-]*:\/\//i,
  /^[a-z0-9-]+(?:\.[a-z0-9-]+)+\//i,
];

/** `/term?id=…` and `#anchor` are the other two Ref forms; neither is a name. */
const OTHER_REF_FORMS = /^[/#]/;

/**
 * True when what is being typed is heading for a web address or one of the
 * other Ref forms rather than a saved name, and the dropdown should stay out
 * of the way.
 */
export function looksLikeUrl(text: string): boolean {
  if (!text) return false;
  if (OTHER_REF_FORMS.test(text)) return true;
  return URL_LIKE.some((pattern) => pattern.test(text));
}

/**
 * The word the caret is inside, which is what a completion replaces. Ref holds
 * a whole line of free text — `Lecture 4, page 12 [[Closure]]` is one value —
 * so only the word being typed is treated as the query, and the rest of the
 * line is left alone.
 */
export function activeRefQuery(value: string, caret: number): RefQuery {
  const position = Math.max(0, Math.min(caret, value.length));

  let start = position;
  while (start > 0 && !/\s/.test(value[start - 1])) start -= 1;

  let end = position;
  while (end < value.length && !/\s/.test(value[end])) end += 1;

  return { start, end, text: value.slice(start, position) };
}

/** `[[Clo` and `Clo` should offer the same names, so the brackets come off. */
function normalise(text: string): string {
  return text.replace(/^\[+/, "").trimStart().toLocaleLowerCase();
}

/**
 * Names matching what has been typed, prefix matches first and each group in
 * alphabetical order, so the list only ever shrinks as more is typed. Names
 * in `exclude` are left out entirely.
 *
 * Terms win a name clash, the same rule `buildLinkIndex` follows when it
 * resolves `[[Name]]` back to a page — offering a phrase that the link would
 * not actually reach would be a lie.
 */
export function suggestRefs(
  entries: readonly Entry[],
  phrases: readonly Phrase[],
  query: string,
  exclude: readonly string[] = [],
  limit: number = SUGGESTION_LIMIT,
): RefSuggestion[] {
  const needle = normalise(query);
  if (!needle) return [];

  // Whatever is open in the form cannot be a useful reference: a Ref that
  // points at its own entry is a link back to the page you are already on.
  // Both the saved name and the one being typed are dropped, so renaming
  // something mid-edit cannot make it offer itself.
  const skip = new Set(
    exclude.map((name) => name.trim().toLocaleLowerCase()).filter(Boolean),
  );

  const byName = new Map<string, RefSuggestion>();
  for (const phrase of phrases) {
    byName.set(phrase.phrase.toLocaleLowerCase(), { name: phrase.phrase, kind: "phrase" });
  }
  for (const entry of entries) {
    byName.set(entry.term.toLocaleLowerCase(), { name: entry.term, kind: "term" });
  }

  const prefix: RefSuggestion[] = [];
  const elsewhere: RefSuggestion[] = [];
  for (const [lowered, suggestion] of byName) {
    if (skip.has(lowered)) continue;
    if (lowered.startsWith(needle)) prefix.push(suggestion);
    else if (lowered.includes(needle)) elsewhere.push(suggestion);
  }

  const byLabel = (a: RefSuggestion, b: RefSuggestion) => a.name.localeCompare(b.name);
  return [...prefix.sort(byLabel), ...elsewhere.sort(byLabel)].slice(0, limit);
}

/**
 * Writes the chosen name into the field as `[[Name]]`, which is the form the
 * app already stores and `parseRef` already reads. The value stays an ordinary
 * string; nothing else about the field changes.
 */
export function applyRefSuggestion(
  value: string,
  query: RefQuery,
  name: string,
): { value: string; caret: number } {
  const replacement = `[[${name}]]`;
  return {
    value: value.slice(0, query.start) + replacement + value.slice(query.end),
    caret: query.start + replacement.length,
  };
}
