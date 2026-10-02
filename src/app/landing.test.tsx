import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import LandingPage from "@/app/page";
import { FAQ } from "@/lib/site";

const html = renderToStaticMarkup(<LandingPage />);

describe("the landing page", () => {
  it("has exactly one h1", () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  });

  it("offers sign-up and sign-in", () => {
    expect(html).toContain('href="/sign-up"');
    expect(html).toContain('href="/sign-in"');
  });

  it("sends search engines the same questions the page shows", () => {
    const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    expect(json).toBeTruthy();
    const graph = JSON.parse(json!)["@graph"];
    const faq = graph.find((node: { "@type": string }) => node["@type"] === "FAQPage");
    expect(faq.mainEntity.map((q: { name: string }) => q.name)).toEqual(FAQ.map((q) => q.question));
    for (const { question } of FAQ) expect(html).toContain(question);
  });

  it("folds each answer into a details element", () => {
    const blocks = html.match(/<details[\s\S]*?<\/details>/g) ?? [];
    expect(blocks).toHaveLength(FAQ.length);
    FAQ.forEach(({ answer }, i) => expect(blocks[i]).toContain(answer.replace("'", "&#x27;")));
  });

  it("never mentions price, which is undecided", () => {
    expect(html).not.toMatch(/\bfree\b|\bprice\b|\$|€/i);
  });

  it("uses no em dashes", () => {
    expect(html).not.toContain("—");
  });
});
