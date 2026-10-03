import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkedField } from "@/components/grammar/MarkedField";

const html = (value: string) =>
  renderToStaticMarkup(<MarkedField id="f" value={value} onChange={() => {}} className="field" />);

describe("MarkedField", () => {
  it("tints a highlight behind the box and greys its markers", () => {
    const markup = html("a ==y:b== c");
    expect(markup).toMatch(/<mark class="[^"]*bg-yellow-200[^"]*">b<\/mark>/);
    expect(markup).toContain('<span class="text-ink-soft">==y:</span>');
    expect(markup).toContain("text-transparent!");
  });

  it("leaves a box without highlights drawing its own text", () => {
    const markup = html("x == y");
    expect(markup).not.toContain("text-transparent!");
    expect(markup).toContain("invisible");
  });

  it("makes a table cell a one-line box that wraps, so Enter still moves down", () => {
    const markup = renderToStaticMarkup(<MarkedField id="c" value="der" onChange={() => {}} className="field" wrap />);
    expect(markup).toMatch(/<textarea[^>]*data-single-line/);
    expect(markup).toContain('rows="1"');
    expect(markup).toContain("resize-none");
  });
});
