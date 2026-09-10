/**
 * Name ordering for the lists.
 *
 * German nouns are saved with their article — `die Tür`, `der Tisch`,
 * `das Buch` — so sorting the raw strings piles most of the list under D and
 * hides the word you are actually looking for. The article is skipped for the
 * comparison only: nothing about the stored value changes, and a term that is
 * itself just `der`, `die`, or `das` keeps its whole name, since there is
 * nothing after it to sort on.
 */

/** Only the three definite articles, and only with a word behind them. */
const LEADING_ARTICLE = /^(?:der|die|das)\s+/i;

/**
 * Plain alphabetical, case- and accent-insensitive, so `Über` files under U
 * rather than after Z. Used for the free-text columns, where there is no
 * article convention to look past.
 */
export function compareText(a: string, b: string): number {
  return a.trim().localeCompare(b.trim(), undefined, { sensitivity: "base" });
}

/** What a name is compared as, once its leading article is out of the way. */
export function sortableName(name: string): string {
  return name.trim().replace(LEADING_ARTICLE, "");
}

/** Alphabetical by the word that carries the meaning, article ignored. */
export function compareNames(a: string, b: string): number {
  return compareText(sortableName(a), sortableName(b));
}
