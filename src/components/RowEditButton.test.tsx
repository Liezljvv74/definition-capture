import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RowEditButton } from "@/components/RowEditButton";

/**
 * Rendered to a string rather than to a DOM. It needs no jsdom, no testing
 * library and no browser, which is what makes it worth having for a button
 * this small: what is asserted is the part that is easy to break silently and
 * invisible when it is wrong — the accessible name, and the fact that the
 * pencil does not look like the bin beside it.
 */
describe("RowEditButton", () => {
  const html = (label: string) =>
    renderToStaticMarkup(<RowEditButton label={label} onClick={() => {}} />);

  it("names what it edits, for both the label and the tooltip", () => {
    // Every row has one of these, so "Edit" alone would leave a screen
    // reader listing a column of identical buttons.
    expect(html("The dative case")).toContain('aria-label="Edit The dative case"');
    expect(html("The dative case")).toContain('title="Edit The dative case"');
  });

  it("is type=button, so it cannot submit a form it happens to sit inside", () => {
    expect(html("x")).toContain('type="button"');
  });

  it("hides the glyph from screen readers, which read the label instead", () => {
    expect(html("x")).toContain('aria-hidden="true"');
  });

  it("does not borrow the delete button's red, so the pair stay distinct", () => {
    // Two grey icons side by side, one of which destroys the row: the hover
    // colour is what keeps them apart at a glance.
    expect(html("x")).toContain("hover:text-indigo-600");
    expect(html("x")).not.toContain("hover:text-red-600");
  });
});
