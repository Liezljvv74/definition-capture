import type { ReactNode } from "react";

const PATHS = {
  // A loose wave, for the main heading.
  wave: "M2 11 Q 15 2 28 10 T 55 9 T 98 8",
  // A tighter one with more turns, for a section title.
  wiggle: "M1 7 Q 12 1 25 7 T 50 6 T 75 7 T 99 5",
};

/**
 * A hand-drawn underline that draws itself under a word, after the mock-up's
 * scribble. Purely decorative: the SVG is aria-hidden, and under reduced
 * motion notebook.css shows it already drawn.
 */
export function Scribble({
  children,
  colour = "var(--color-accent)",
  shape = "wave",
}: {
  children: ReactNode;
  colour?: string;
  shape?: keyof typeof PATHS;
}) {
  return (
    <span className="scribble">
      {children}
      <svg viewBox="0 0 100 18" preserveAspectRatio="none" aria-hidden="true">
        <path pathLength={1} d={PATHS[shape]} style={{ stroke: colour }} />
      </svg>
    </span>
  );
}
