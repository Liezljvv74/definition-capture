import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RememberCard } from "@/components/home/RememberCard";

const item = {
  id: "abc",
  item_type: "word",
  title: "ephemeral",
  definition: "lasting a very short time",
  literal_meaning: null,
  usage_example: null,
  tenses: null,
  verb_rows: null,
};

describe("RememberCard", () => {
  it("is a collapsed disclosure whose controlled element exists and is hidden", () => {
    const out = renderToStaticMarkup(<RememberCard item={item} />);
    expect(out).toContain('aria-expanded="false"');
    const id = out.match(/aria-controls="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(out).toMatch(new RegExp(`<p id="${id}" hidden=""`));
    expect(out).toContain("Show meaning");
  });
});
