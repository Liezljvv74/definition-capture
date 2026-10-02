"use client";

import { useEffect } from "react";

import { docBox, drawDoodle, reducedMotion, type DoodleShape } from "@/components/notebook/doodles";

/** What an idle doodle can be: the calmer shapes, nothing that reads as a mark. */
const IDLE: DoodleShape[] = ["star", "heart", "spiral", "sparkle", "squiggle", "loop", "arrow"];

/**
 * The page-level doodle triggers, rendered once on a notebook page. It draws
 * nothing itself and holds no state; it listens on the document so the page
 * stays a server component:
 *
 * - an element with `data-doodle="<shape>"` draws that shape in its bottom
 *   right corner when hovered or tapped;
 * - opening a `<details>` draws a squiggle under its summary and an arrow
 *   pointing at it, just outside its left edge;
 * - every 8 to 10 seconds a doodle appears in the left margin, the one place
 *   on the page with no text to cover. Skipped while the tab is hidden, and
 *   never under reduced motion.
 */
export function NotebookDoodles() {
  useEffect(() => {
    const reduce = reducedMotion();

    function onTile(event: Event) {
      const tile = (event.target as Element | null)?.closest?.("[data-doodle]");
      if (!tile) return;
      // Hovering from one child of the tile to another should not draw again.
      if (event.type === "mouseover" && tile.contains((event as MouseEvent).relatedTarget as Node | null)) return;
      const b = docBox(tile);
      drawDoodle(tile.getAttribute("data-doodle") as DoodleShape, b.left + b.width - 14, b.top + b.height - 6, { size: 42, life: 1800 });
    }

    function onToggle(event: Event) {
      const details = event.target as HTMLDetailsElement;
      if (details.tagName !== "DETAILS" || !details.open) return;
      const summary = details.querySelector("summary");
      if (!summary) return;
      const b = docBox(summary);
      drawDoodle("squiggle", b.left + b.width * 0.35, b.top + b.height - 2, { size: 64, colour: "#e8868b", life: 1800 });
      drawDoodle("arrow", b.left - 26, b.top + b.height / 2, { size: 34, colour: "#4b35e8", life: 1800 });
    }

    document.addEventListener("mouseover", onTile);
    document.addEventListener("click", onTile);
    // `toggle` does not bubble, so it is caught on the way down.
    document.addEventListener("toggle", onToggle, true);

    let timer: number | undefined;
    if (!reduce) {
      const idle = () => {
        if (!document.hidden) {
          const wide = window.innerWidth >= 768;
          const x = wide ? 22 + Math.random() * 18 : 12;
          const y = window.scrollY + 90 + Math.random() * Math.max(window.innerHeight - 180, 40);
          drawDoodle(IDLE[Math.floor(Math.random() * IDLE.length)], x, y, { size: wide ? 40 : 22, life: 2600 });
        }
        timer = window.setTimeout(idle, 8000 + Math.random() * 2000);
      };
      timer = window.setTimeout(idle, 3500);
    }

    return () => {
      document.removeEventListener("mouseover", onTile);
      document.removeEventListener("click", onTile);
      document.removeEventListener("toggle", onToggle, true);
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}
