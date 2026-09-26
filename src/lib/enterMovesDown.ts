/**
 * Enter in a field moves to the next field below it, everywhere in the app;
 * Tab keeps the browser's own order, across and then down to the next line.
 * In a table that is the cell underneath, in a form the next line down.
 *
 * Position on screen rather than order in the page decides what "below" is,
 * because the two disagree exactly where it matters: in a table the next
 * field in the page is the cell to the right, and in a two-column form row
 * it is the field beside.
 */

export type Box = { top: number; bottom: number; left: number };

/** A few pixels of slack, so fields in one row with slightly different heights still count as one row. */
const SAME_ROW = 4;

/**
 * The index of the box to move to from `from`, or -1 when nothing is below:
 * the nearest row underneath, and in it the box whose left edge lines up best.
 */
export function boxBelow(from: Box, boxes: readonly Box[]): number {
  let rowTop = Infinity;
  for (const box of boxes) {
    if (box.top >= from.bottom - SAME_ROW && box.top < rowTop) rowTop = box.top;
  }
  let best = -1;
  boxes.forEach((box, index) => {
    if (box.top < from.bottom - SAME_ROW || box.top > rowTop + SAME_ROW) return;
    if (best === -1 || Math.abs(box.left - from.left) < Math.abs(boxes[best].left - from.left)) best = index;
  });
  return best;
}

/** Where Enter moves from. A textarea keeps Enter for a new line, and a checkbox or button keeps what it does. */
const SOURCE =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="file"]):not([type="range"]):not([type="color"])';

/** Where Enter can land: any field a reader types into or picks from. */
const TARGET = `${SOURCE}:not([type="hidden"]):not(:disabled):not([readonly]), textarea:not(:disabled):not([readonly]), select:not(:disabled)`;

/**
 * The keydown listener. It runs after every field's own handler and steps
 * aside for any that already dealt with Enter (a suggestion list picking a
 * name, a Settings field adding one), so those keep working unchanged.
 *
 * With nothing below, the form is submitted, which is what Enter did before:
 * a sign-in form still signs in from the password field, and a one-field form
 * still submits from its only field.
 */
export function handleEnter(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.defaultPrevented || event.isComposing) return;
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
  const field = event.target;
  if (!(field instanceof HTMLInputElement) || !field.matches(SOURCE)) return;

  const scope = field.closest("form, [role='dialog'], main") ?? document.body;
  const candidates = Array.from(scope.querySelectorAll<HTMLElement>(TARGET)).filter(
    (element) => element !== field && element.getClientRects().length > 0,
  );
  const boxes = candidates.map((element) => element.getBoundingClientRect());
  const next = boxBelow(field.getBoundingClientRect(), boxes);

  event.preventDefault();
  if (next !== -1) {
    candidates[next].focus();
    if (candidates[next] instanceof HTMLInputElement) (candidates[next] as HTMLInputElement).select();
  } else {
    field.form?.requestSubmit();
  }
}
