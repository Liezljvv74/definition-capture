import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TableEditor } from "@/components/grammar/TableEditor";

/**
 * Rendered to a string, as the other grammar components are. What happens
 * on a click or a key needs a browser; this pins that every row and column
 * has its handle, that the handles stay out of the Tab order, and that each
 * cell keeps the label its text box is found by.
 */
const html = renderToStaticMarkup(
  <TableEditor
    block={{ kind: "table", id: "t", headerRow: true, headerColumn: false, cells: [["a", "b", "c"], ["d", "e", "f"]] }}
    onChange={() => {}}
    inputId="x"
  />,
);

describe("TableEditor", () => {
  it("has a handle for the table, each column and each row, out of the Tab order", () => {
    expect(html).toContain('aria-label="Select the whole table"');
    for (const c of [1, 2, 3]) expect(html).toContain(`aria-label="Select column ${c}"`);
    for (const r of [1, 2]) expect(html).toContain(`aria-label="Select row ${r}"`);
    expect(html.match(/aria-label="Select /g)).toHaveLength(6);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(6);
  });

  it("keeps each cell's text box and its label", () => {
    expect(html).toContain('for="x-1-2"');
    expect(html).toContain('id="x-1-2"');
  });
});
