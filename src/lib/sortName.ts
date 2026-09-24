/**
 * Name ordering for the lists, in the language the account is learning.
 *
 * Two things depend on the language. The alphabetical order does: Swedish
 * files `ä` after `z`, Spanish gives `ñ` a place of its own after `n`, and
 * German puts `ä` with `a`. And so do the words to look past: nouns are
 * saved with their article (`die Tür`, `la maison`, `the house`), so sorting
 * the raw strings piles most of a list under a handful of letters and hides
 * the word you are actually looking for.
 *
 * Both used to be German and fixed. They are now the account's own, from
 * Settings, and `sortingFor` turns them into the pair of comparators the
 * lists use. The words are skipped for the comparison only: nothing about the
 * stored value changes.
 */

import { canSortIn } from "@/lib/languages";

export type Sorting = {
  /**
   * Plain alphabetical, case- and accent-insensitive, so `Über` files under U
   * rather than after Z. Used for every list, and for the free-text columns,
   * where there is no article convention to look past.
   */
  compareText: (a: string, b: string) => number;
  /**
   * Alphabetical by the word that carries the meaning, a leading skip word
   * ignored. Vocabulary's word column only.
   */
  compareNames: (a: string, b: string) => number;
};

/**
 * The order used when no language is chosen, when one was typed in by name,
 * or when this browser cannot sort in the one chosen.
 *
 * Pinned rather than left to the host. `undefined`, and the "undetermined"
 * code `und` with it, mean "however this machine is configured", which sorts
 * the same list differently on differently configured browsers for the same
 * account. English collation is the Unicode default order with nothing
 * tailored, which is as neutral as an order gets. German is identical to it,
 * so an account that sorted in German before this setting existed keeps its
 * alphabet.
 */
const NEUTRAL_LOCALE = "en";

/** Straight and curly, since a phone keyboard types the curly one. */
const APOSTROPHES = "'’";

function escapeForPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The leading words to look past, as one pattern, or null when there are none.
 *
 * Each word is matched as plain text, whatever it contains: a word someone
 * typed is not a regular expression. Longest first, so `einem` is tried
 * before `ein` and `les` before `le`. That does not change what matches,
 * since each alternative has to be followed by a space, but it keeps the
 * pattern reading as the rule it is.
 *
 * A word ending in an apostrophe is elided onto the next one, as in French
 * `l'homme` or Italian `un'amica`, and has no space to wait for. It still
 * needs something after it, so a bare `l'` keeps its whole name. Any other
 * word needs whitespace after it, which is what keeps `Dessert`, `Denkmal`
 * and `Einbahnstraße` whole: they begin with an article's letters, not with
 * an article.
 */
export function skipPattern(skipWords: readonly string[]): RegExp | null {
  const spaced: string[] = [];
  const elided: string[] = [];

  for (const raw of skipWords) {
    const word = raw.trim().normalize("NFC");
    if (!word) continue;
    const last = word[word.length - 1];
    if (APOSTROPHES.includes(last)) {
      const stem = word.slice(0, -1);
      if (stem) elided.push(stem);
    } else {
      spaced.push(word);
    }
  }

  const longestFirst = (words: string[]) =>
    [...words].sort((a, b) => b.length - a.length).map(escapeForPattern).join("|");

  const alternatives: string[] = [];
  if (spaced.length) alternatives.push(`(?:${longestFirst(spaced)})\\s+`);
  if (elided.length) {
    alternatives.push(`(?:${longestFirst(elided)})[${APOSTROPHES}]\\s*(?=\\S)`);
  }
  if (!alternatives.length) return null;

  // `u` so that `i` folds case beyond ASCII: a Greek or Cyrillic article
  // typed in capitals still matches.
  return new RegExp(`^(?:${alternatives.join("|")})`, "iu");
}

function buildSorting(language: string, skipWords: readonly string[]): Sorting {
  /*
   * One collator per rule, built here and reused for every comparison.
   *
   * `String.prototype.localeCompare` with an options object constructs a
   * fresh collator on essentially every call, and a comparator runs
   * O(n log n) times, so the cost landed on every keystroke in the search
   * box, which re-runs the sort. Hoisting it measured about a 27x
   * improvement on a thousand-row list. This is the same hoisting, one level
   * up: the collator is built when the language changes, not per call.
   *
   * A language the browser cannot sort in would otherwise fall back to the
   * host's own locale, which is the unpinned order the neutral one exists to
   * avoid.
   */
  const locale = language && canSortIn(language) ? language : NEUTRAL_LOCALE;
  const collator = new Intl.Collator(locale, { sensitivity: "base" });
  const pattern = skipPattern(skipWords);

  const compareText = (a: string, b: string) => collator.compare(a.trim(), b.trim());

  // Composed either way, so a name compares the same whether or not there is
  // a pattern to strip; see `foldName` for why pasted text may not be.
  const sortableName = pattern
    ? (name: string) => name.trim().normalize("NFC").replace(pattern, "")
    : (name: string) => name.trim().normalize("NFC");

  return {
    compareText,
    compareNames: (a, b) => compareText(sortableName(a), sortableName(b)),
  };
}

/**
 * Built rules, keyed on what they were built from.
 *
 * Keyed on the values rather than held per caller, so that every render of a
 * list asking for the same language and words gets the same object back. That
 * identity is what the pages' sort memos depend on: a new object would mean a
 * re-sort on every render, and the same object after the language changed
 * would mean a list left in the old order.
 */
const built = new Map<string, Sorting>();

export function sortingFor(language: string, skipWords: readonly string[]): Sorting {
  const key = `${language}\u0000${skipWords.join("\u0001")}`;
  let sorting = built.get(key);
  if (!sorting) {
    // A handful at most in practice, one per language tried in Settings; the
    // cap only stops a long session editing the list from growing this.
    if (built.size >= 16) built.clear();
    sorting = buildSorting(language, skipWords);
    built.set(key, sorting);
  }
  return sorting;
}
