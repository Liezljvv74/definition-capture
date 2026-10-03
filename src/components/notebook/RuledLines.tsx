"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** The paper's line pitch and where its lines start, as in notebook.css. */
const PITCH = 32;
const OFFSET = 20;

const mod = (n: number) => ((n % PITCH) + PITCH) % PITCH;

/**
 * Keeps writing on the lines of the paper, for the two things that cannot do
 * it with CSS alone:
 *
 * - an element with `data-ruled-snap` gets the top padding that puts its
 *   content on a line, so a list whose rows are one line tall sits on the
 *   ruling instead of across it;
 * - a `ruled` element (the sticky filter bar) draws its own lines to cover
 *   what scrolls under it, and they are shifted as it moves so they carry on
 *   the page's lines rather than breaking them.
 *
 * Rendered once in the root layout; it draws nothing.
 */
export function RuledLines() {
  const pathname = usePathname();

  useEffect(() => {
    const paper = document.querySelector<HTMLElement>(".notebook");
    if (!paper) return;
    const at = (el: HTMLElement) => el.getBoundingClientRect().top - paper.getBoundingClientRect().top;

    function sync() {
      for (const el of document.querySelectorAll<HTMLElement>(".ruled")) {
        el.style.setProperty("--ruled-y", `${mod(OFFSET - at(el))}px`);
      }
    }
    function snap() {
      for (const el of document.querySelectorAll<HTMLElement>("[data-ruled-snap]")) {
        el.style.paddingTop = `${mod(OFFSET - at(el))}px`;
      }
      sync();
    }

    // Anything above a list that changes height (a list loading, a banner,
    // filters wrapping) changes the paper's height too, so one observer on
    // the paper catches them all.
    const observer = new ResizeObserver(snap);
    observer.observe(paper);
    window.addEventListener("scroll", sync, { passive: true });
    snap();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", sync);
    };
  }, [pathname]);

  return null;
}
