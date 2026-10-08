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
  it("is a closed disclosure whose summary is the word", () => {
    const out = renderToStaticMarkup(<RememberCard item={item} />);
    expect(out).toMatch(/<details><summary [^>]*>ephemeral<span class="sr-only"> meaning<\/span><\/summary>/);
    expect(out).not.toContain("<details open");
    expect(out).toContain("<h2");
  });

  it("shows a phrase's title and its meaning inside the disclosure", () => {
    const phrase = { ...item, item_type: "phrase", title: "break the ice", definition: null, literal_meaning: "start a conversation", usage_example: "He told a joke." };
    const out = renderToStaticMarkup(<RememberCard item={phrase} />);
    expect(out).toContain("break the ice");
    expect(out).toMatch(/<\/summary><p [^>]*>[^<]*start a conversation[\s\S]*<\/details>/);
  });
});
