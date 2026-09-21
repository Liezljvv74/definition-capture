/**
 * Stands in for a table cell with nothing in it.
 *
 * The term list inlined this markup twice and the phrase list kept its own
 * copy of it, which is three places to change the day the placeholder should
 * look different. It is one place now.
 *
 * `aria-hidden` because an empty cell is already empty to a screen reader:
 * reading a punctuation mark aloud on every blank field would be noise, not
 * information.
 */
export function EmptyCell() {
  return (
    <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
      -
    </span>
  );
}
