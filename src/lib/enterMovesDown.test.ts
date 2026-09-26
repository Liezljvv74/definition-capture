import { describe, expect, it } from "vitest";

import { boxBelow, type Box } from "@/lib/enterMovesDown";

const box = (top: number, left: number, height = 30): Box => ({ top, bottom: top + height, left });

describe("boxBelow", () => {
  // A 3 by 3 table of cells, 30px tall and 100px wide.
  const grid = [0, 30, 60].flatMap((top) => [0, 100, 200].map((left) => box(top, left)));

  it("moves to the cell underneath in a table, not the one to the right", () => {
    expect(boxBelow(grid[1], grid)).toBe(4);
    expect(boxBelow(grid[4], grid)).toBe(7);
  });

  it("finds nothing below the last row", () => {
    expect(boxBelow(grid[8], grid)).toBe(-1);
  });

  it("skips the field beside in a two-column form row", () => {
    const form = [box(0, 0), box(0, 300), box(60, 0, 100)];
    expect(boxBelow(form[0], form)).toBe(2);
  });

  it("reaches a field below that starts further left", () => {
    // The topic sits right of the title; the block underneath spans the page.
    const form = [box(0, 0), box(0, 300), box(60, 0)];
    expect(boxBelow(form[1], form)).toBe(2);
  });

  it("takes the nearest row even when a taller neighbour is not aligned exactly", () => {
    const rows = [box(0, 0), box(40, 10, 60), box(42, 200), box(120, 0)];
    expect(boxBelow(rows[0], rows)).toBe(1);
  });
});
