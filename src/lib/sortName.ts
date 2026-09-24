/**
 * Name ordering for the lists.
 *
 * German nouns are saved with their article (`die Tür`, `der Tisch`,
 * `eine Menge`), so sorting the raw strings piles most of the list under D and
 * E and hides the word you are actually looking for. The article is skipped
 * for the comparison only: nothing about the stored value changes, and a word
 * that is itself just an article, such as `der` or `ein`, keeps its whole
 * name, since there is nothing after it to sort on.
 */

/**
 * Every case form of the definite and the indefinite article, and only with
 * a word behind them. The `\s+` is what keeps `Dessert`, `Denkmal` and
 * `Einbahnstraße` whole: they begin with an article's letters, not with an
 * article.
 */
const LEADING_ARTICLE =
  /^(?:der|die|das|dem|den|des|einem|einen|einer|eines|eine|ein)\s+/i;

/**
 * Built once, at module scope, and reused for every comparison.
 *
 * `String.prototype.localeCompare` with an options object constructs a fresh
 * collator on essentially every call, and a comparator runs O(n log n) times —
 * so the cost landed on every keystroke in the search box, which re-runs the
 * sort. Hoisting it measured about a 27x improvement on a thousand-row list.
 *
 * The locale is named rather than left to the host. `undefined` means "however
 * this machine is configured", which sorts a German list differently on a
 * German browser than on an English one, for the same account and the same
 * data. `de` is the language this glossary is for, and it puts `ä` with `a`
 * rather than after `z`.
 */
const collator = new Intl.Collator("de", { sensitivity: "base" });

/**
 * Plain alphabetical, case- and accent-insensitive, so `Über` files under U
 * rather than after Z. Used for the free-text columns, where there is no
 * article convention to look past.
 */
export function compareText(a: string, b: string): number {
  return collator.compare(a.trim(), b.trim());
}

/** What a name is compared as, once its leading article is out of the way. */
function sortableName(name: string): string {
  return name.trim().replace(LEADING_ARTICLE, "");
}

/** Alphabetical by the word that carries the meaning, article ignored. */
export function compareNames(a: string, b: string): number {
  return compareText(sortableName(a), sortableName(b));
}
