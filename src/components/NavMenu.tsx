"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** Shared by the plain tabs and the dropdown triggers, so they sit level. */
export const TAB_BASE =
  "-mb-px inline-block border-b-2 px-3 py-2.5 text-sm font-medium transition";
export const TAB_ON =
  "border-indigo-600 text-indigo-700 dark:border-indigo-400 dark:text-indigo-300";
export const TAB_OFF =
  "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-100";

/**
 * A nav tab that opens a menu instead of navigating.
 *
 * Extracted when the Backup menu was added, because the interesting part of
 * one of these is not the markup — it is closing at the right moments, and
 * putting focus back on the trigger when Escape closes it so the keyboard is
 * not stranded at the top of the document. A second hand-rolled copy of that
 * is how one menu quietly ends up less usable than the other.
 *
 * The children are given `close`, because what closes the menu differs: a
 * link closes on click even when it navigates nowhere new, while a button
 * closes once it has opened whatever it opens.
 */
export function NavMenu({
  label,
  active = false,
  icon,
  align = "left",
  element = "li",
  children,
}: {
  label: string;
  /** Lights the tab up when the section it stands for is the current one. */
  active?: boolean;
  /**
   * Shown instead of the label, which then becomes the accessible name. For
   * the gear at the end of the bar, which is a menu like the others and has
   * no room to say so in words.
   */
  icon?: ReactNode;
  /**
   * Which edge the menu hangs from. The one at the right-hand end of the bar
   * would otherwise open off the side of the window.
   */
  align?: "left" | "right";
  /**
   * What the menu wraps itself in. A tab in the nav bar is a list item, since
   * the bar is a list of destinations. The gear is not: it already sits inside
   * the account item, and an `li` inside an `li` is invalid HTML that the
   * browser rewrites, which shows up as a hydration mismatch rather than as a
   * layout problem.
   */
  element?: "li" | "div";
  children: (close: () => void) => ReactNode;
}) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Back to the trigger, so Escape does not strand the keyboard at the
      // top of the document.
      container.current?.querySelector("button")?.focus();
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // The root differs, the rest does not, so the contents are built once and
  // the wrapper chosen around them.
  const inside = (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-current={active ? "page" : undefined}
        aria-label={icon ? label : undefined}
        title={icon ? label : undefined}
        onClick={() => setOpen((current) => !current)}
        className={
          icon
            ? ICON_TAB
            : `${TAB_BASE} ${active ? TAB_ON : TAB_OFF} inline-flex cursor-pointer items-center gap-1`
        }
      >
        {icon ?? (
          <>
            {label}
            <span aria-hidden="true" className={`text-[0.6rem] ${open ? "rotate-180" : ""}`}>
              ▼
            </span>
          </>
        )}
      </button>

      <ul
        id={menuId}
        role="menu"
        aria-label={label}
        hidden={!open}
        className={`card absolute top-full z-20 mt-1 min-w-40 p-1 shadow-lg ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        {children(() => setOpen(false))}
      </ul>
    </>
  );
  const className = "relative shrink-0";
  // A callback ref rather than the object: the two roots are different element
  // types, and one `HTMLElement` ref accepts both where a typed one accepts
  // neither.
  const hold = (node: HTMLElement | null) => {
    container.current = node;
  };

  return element === "li" ? (
    <li ref={hold} className={className}>
      {inside}
    </li>
  ) : (
    <div ref={hold} className={className}>
      {inside}
    </div>
  );
}

/** The icon form of the trigger, for a menu with no room for a word. */
const ICON_TAB =
  "cursor-pointer rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100";

/** The shape every item in one of these menus takes. */
export const MENU_ITEM =
  "block w-full cursor-pointer rounded-md px-3 py-1.5 text-left text-sm font-medium transition text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800";

/** The same, for the item standing for the page you are already on. */
export const MENU_ITEM_CURRENT =
  "block w-full rounded-md px-3 py-1.5 text-left text-sm font-medium transition bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300";
