import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BlockView } from "@/components/grammar/BlockView";
import type { LinkIndex } from "@/components/RefText";

/**
 * Rendered to a string, as `MainNav.test.tsx` is, so this needs no jsdom.
 * These pin what the reader sees: which cells are headers, that a gap is
 * marked and its braces are not shown, and that a link resolves.
 */
const links: LinkIndex = new Map([["cases", "/rule?id=r1"]]);
const html = (block: Parameters<typeof BlockView>[0]["block"]) =>
  renderToStaticMarkup(<BlockView block={block} linkIndex={links} />);

describe("BlockView", () => {
  it("renders text with bold, italic, bullets and a resolved link", () => {
    const markup = html({ kind: "text", id: "a", text: "**Wem?** *dem*\n- one\nsee [[Cases]] and [[Nothing]]" });
    expect(markup).toContain("<strong>Wem?</strong>");
    expect(markup).toContain("<em>dem</em>");
    expect(markup).toContain("<li><span>one</span></li>");
    expect(markup).toContain('href="/rule?id=r1"');
    // An unresolved name reads as dotted text, as it does in a Ref.
    expect(markup).toContain("decoration-dotted");
  });

  it("marks the header row and column of a table", () => {
    const markup = html({
      kind: "table",
      id: "t",
      headerRow: true,
      headerColumn: true,
      cells: [
        ["", "m"],
        ["Dat", "dem"],
      ],
    });
    expect(markup.match(/<th/g)).toHaveLength(3);
    expect(markup.match(/<td/g)).toHaveLength(1);
    // Exactly one of each: the (0,1) cell heads its column, the (1,0) cell
    // heads its row, and the corner cell (0,0), which is both, heads neither.
    expect(markup.match(/scope="col"/g)).toHaveLength(1);
    expect(markup.match(/scope="row"/g)).toHaveLength(1);
  });

  it("shows an example's gaps without their braces", () => {
    const markup = html({ kind: "example", id: "e", sentence: "Ich gebe {dem} Mann", translation: "I give the man" });
    expect(markup).not.toContain("{");
    expect(markup).toContain(">dem<");
    expect(markup).toContain("I give the man");
  });
});
