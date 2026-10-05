import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SelectionToolbar } from "@/components/grammar/SelectionToolbar";

describe("SelectionToolbar", () => {
  it("offers only what it is given", () => {
    const html = renderToStaticMarkup(
      <SelectionToolbar top={0} left={0} onHighlight={() => {}} onRemove={null} onLink={null} onNewRule={() => {}} />,
    );
    expect(html).toContain('aria-label="Highlight yellow"');
    expect(html).toContain('aria-label="Highlight green"');
    expect(html).toContain('aria-label="Highlight blue"');
    expect(html).toContain('aria-label="Highlight purple"');
    expect(html).not.toContain("Remove highlight");
    expect(html).not.toContain("Link to");
    expect(html).toContain("New rule from this");
    expect(html).not.toContain("Remove link");
  });

  it("offers Remove link when given it", () => {
    const html = renderToStaticMarkup(
      <SelectionToolbar top={0} left={0} onHighlight={null} onRemove={null} onLink={null} onNewRule={null} onUnlink={() => {}} />,
    );
    expect(html).toContain("Remove link");
  });
});
