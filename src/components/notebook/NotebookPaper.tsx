import type { ReactNode } from "react";

/** Where the punch holes sit down the left edge, as a share of the page. */
const HOLES = ["11%", "46%", "82%"];

/**
 * A page of lined notebook paper: ruled lines, the red double margin line and
 * punch holes, behind whatever it wraps. The lines and colours are the
 * `notebook` utility in notebook.css; the margin and holes are elements here
 * because a background cannot draw them at a fixed distance from the edge.
 * All decoration is aria-hidden and takes no clicks.
 */
export function NotebookPaper({ children }: { children: ReactNode }) {
  return (
    <div className="notebook flex min-h-full flex-1 flex-col">
      <div aria-hidden="true" className="notebook-margin" />
      {HOLES.map((top) => (
        <div key={top} aria-hidden="true" className="notebook-hole" style={{ top }} />
      ))}
      {children}
    </div>
  );
}
