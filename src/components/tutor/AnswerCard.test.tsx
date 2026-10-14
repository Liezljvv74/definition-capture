import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BlockView } from "@/components/grammar/BlockView";
import { APP_PAGE_LINKS } from "@/lib/tutor";

describe("an answer's links to the app's pages", () => {
  it("shows the page name as a link, with no brackets", () => {
    const html = renderToStaticMarkup(
      <BlockView block={{ kind: "text", id: "a", text: "Add them to [[Vocabulary]]." }} linkIndex={APP_PAGE_LINKS} />,
    );
    expect(html).toMatch(/<a [^>]*href="\/vocabulary"[^>]*>Vocabulary<\/a>/);
    expect(html).not.toContain("[[");
  });
});
