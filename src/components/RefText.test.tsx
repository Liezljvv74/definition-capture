import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RefText } from "@/components/RefText";

describe("RefText", () => {
  it("shows a labelled link by its label, pointing at its name", () => {
    const html = renderToStaticMarkup(
      <RefText value="see [[Dativ|dem]]" linkIndex={new Map([["dativ", "/rule?id=r1"]])} />,
    );
    expect(html).toContain('href="/rule?id=r1"');
    expect(html).toContain(">dem</a>");
    expect(html).not.toContain("Dativ");
  });
});
