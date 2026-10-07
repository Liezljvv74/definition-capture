import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { newAddress, TutorChat } from "@/components/tutor/TutorChat";
import type { TutorExchange } from "@/lib/tutor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

const base = { remaining: 26, reason: "ok", plan: "paid", studiedName: "German", nativeName: "English",
  initialAnswerIn: null, conversationId: null, notFound: false,
} as const;
const more = { initialExchanges: [] as TutorExchange[], linkedRuleIds: [] as string[] };
const html = (props: Partial<Parameters<typeof TutorChat>[0]> = {}) =>
  renderToStaticMarkup(<TutorChat {...base} {...more} {...props} />);

describe("TutorChat", () => {
  it("asks for a studied language, with a link to Settings and no question box", () => {
    const out = html({ studiedName: null });
    expect(out).toContain("Choose the language you are studying");
    expect(out).toMatch(/href="\/settings\/?"/);
    expect(out).not.toContain("<textarea");
  });

  it("replaces the box when the trial is used up", () => {
    const out = html({ reason: "trialUsed", plan: "free", remaining: 0 });
    expect(out).toContain("The tutor is part of the paid plan.");
    expect(out).not.toContain("<textarea");
  });

  it("replaces the box at the daily limit", () => {
    const out = html({ reason: "dailyLimit", remaining: 0 });
    expect(out).toContain("You have used today&#x27;s questions. They reset at midnight UTC.");
    expect(out).not.toContain("<textarea");
  });

  it("shows the allowance for each plan", () => {
    expect(html()).toContain("26 left today");
    expect(html({ plan: "free", remaining: 3 })).toContain("3 trial messages left");
    expect(html({ plan: "free", remaining: 1 })).toContain("1 trial message left");
  });

  it("offers only the studied language when no native language is set", () => {
    expect(html()).toContain("English");
    const out = html({ nativeName: null });
    expect(out).toContain("German");
    expect(out).not.toContain("English");
    expect(out.match(/type="radio"/g)).toHaveLength(1);
  });

  it("says where to add a native language when none is set, and not otherwise", () => {
    // A lone "German" radio told the owner nothing; the legend and the link do.
    expect(html({ nativeName: null })).toContain("Add your native language");
    expect(html({ nativeName: null })).toMatch(/href="\/settings\/?"/);
    expect(html()).not.toContain("Add your native language");
    expect(html()).toContain("Answer in");
  });

  it("never says free, shows a currency sign, or uses an em dash", () => {
    for (const out of [html(), html({ studiedName: null }), html({ reason: "trialUsed", plan: "free", remaining: 0 }), html({ reason: "dailyLimit" })]) {
      expect(out).not.toMatch(/free|[$€£]|\u2014/i);
    }
    // The free plan's allowance line must not use the word either.
    expect(html({ plan: "free", remaining: 3 }).replace("trial messages left", "")).not.toMatch(/free/i);
  });

  const exchange = (id: number | null, title: string, mergeable = id !== null) => ({
    id, kind: "answer" as const, question: `q ${title}`, mergeable,
    reply: { title, topic: "", blocks: [{ id: `b${id}`, kind: "text" as const, text: "body" }], sources: [{ url: "https://www.duden.de/x", title: "Duden" }], existingRule: null, relatedRules: [] },
  });

  it("shows a saved conversation's answers with their sources and a tick box each", () => {
    const out = html({ conversationId: "c1", initialExchanges: [exchange(1, "Dative"), exchange(2, "Accusative")] });
    expect(out).toContain("Dative");
    expect(out).toContain("Accusative");
    expect(out).toContain('href="https://www.duden.de/x"');
    expect(out.match(/Include in a rule/g)).toHaveLength(2);
    expect(out).toContain('id="e-1"');
  });

  it("offers no tick box on an answer that was not saved", () => {
    expect(html({ initialExchanges: [exchange(null, "Dative")] })).not.toContain("Include in a rule");
  });

  it("offers no tick box on an answer whose signature did not verify", () => {
    expect(html({ conversationId: "c1", initialExchanges: [exchange(3, "Dative", false)] })).not.toContain("Include in a rule");
  });

  it("replaces the question box when the account is full", () => {
    const out = html({ reason: "storageFull" });
    expect(out).toContain("You have reached the most conversations and answers an account can keep. Delete a conversation to ask more.");
    expect(out).not.toContain("<textarea");
  });

  it("starts with the answer language carried in the address", () => {
    // The radios carry no value; the checked one is the input just before its language's name.
    expect(html({ initialAnswerIn: "studied" })).toMatch(/checked=""\/>German/);
    expect(html()).toMatch(/checked=""\/>English/);
  });

  it("says when the conversation in the address was not found", () => {
    expect(html({ notFound: true })).toContain("That conversation was not found.");
  });

  it("gives a conversation opened at /tutor its address, even after an unsaved first answer set the state id", () => {
    expect(newAddress(null, "c1", "studied")).toBe("/tutor?c=c1&in=studied");
    expect(newAddress("c1", "c1", "studied")).toBeNull();
    expect(newAddress(null, undefined, "native")).toBeNull();
  });
});
