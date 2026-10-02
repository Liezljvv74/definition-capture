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
  it("is a collapsed disclosure on the word, whose controlled element exists and is hidden", () => {
    const out = renderToStaticMarkup(<RememberCard item={item} />);
    expect(out).toMatch(/<button type="button" aria-expanded="false"[^>]*>ephemeral<span class="sr-only"> Show meaning<\/span><\/button>/);
    const id = out.match(/aria-controls="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(out).toMatch(new RegExp(`<p id="${id}" hidden=""`));
    // The only "Show meaning" left is the visually hidden suffix inside the word's button.
    expect(out.match(/Show meaning/g)).toHaveLength(1);
    expect(out).toContain("<h2");
  });

  it("shows a phrase's title and its meaning in the hidden element", () => {
    const phrase = { ...item, item_type: "phrase", title: "break the ice", definition: null, literal_meaning: "start a conversation", usage_example: "He told a joke." };
    const out = renderToStaticMarkup(<RememberCard item={phrase} />);
    expect(out).toContain("break the ice");
    expect(out).toMatch(/hidden=""[^>]*>[^<]*start a conversation/);
  });
});
