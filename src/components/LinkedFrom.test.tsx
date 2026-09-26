import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { buildLinkIndex, linkTargets } from "@/lib/links";

const targets = linkTargets(
  [{ id: "w1", word: "geben", definition: "", ref: "[[Dativ]]", collections: [], source: "Manual", dateAdded: "", dateUpdated: null, needsDefinition: false }],
  [],
  [],
  [{ id: "r1", title: "Dativ", topic: "Cases", blocks: [], dateAdded: "", dateUpdated: null }],
);
vi.mock("@/lib/useLinkTargets", () => ({
  useLinkTargets: () => ({ targets, linkIndex: buildLinkIndex(targets) }),
}));

import { LinkedFrom } from "@/components/LinkedFrom";

describe("LinkedFrom", () => {
  it("lists what links here, with its kind", () => {
    const html = renderToStaticMarkup(<LinkedFrom href="/rule?id=r1" />);
    expect(html).toContain('href="/word?id=w1"');
    expect(html).toContain("geben");
    expect(html).toContain("Word");
  });

  it("renders nothing when nothing links here", () => {
    expect(renderToStaticMarkup(<LinkedFrom href="/word?id=w1" />)).toBe("");
  });
});
