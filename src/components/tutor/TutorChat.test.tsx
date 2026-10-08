import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AnswerCard } from "@/components/tutor/AnswerCard";
import { newAddress, TutorChat } from "@/components/tutor/TutorChat";
import type { TutorExchange } from "@/lib/tutor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

const base = { remaining: 26, reason: "ok", plan: "paid", studiedName: "German", nativeName: "English",
  initialAnswerIn: null, conversationId: null, notFound: false,
  model: { label: "Claude Sonnet 5.5 by Anthropic", slug: "anthropic/claude-sonnet-5.5" },
} as const;
const more = { initialExchanges: [] as TutorExchange[], linkedRuleIds: [] as string[], savedRules: {} as Record<number, string> };
const html = (props: Partial<Parameters<typeof TutorChat>[0]> = {}) =>
  renderToStaticMarkup(<TutorChat {...base} {...more} {...props} />);

describe("TutorChat", () => {
  it("names the model answering, with its slug on hover", () => {
    const out = html();
    expect(out).toContain("Model: Claude Sonnet 5.5 by Anthropic");
    expect(out).toContain('title="anthropic/claude-sonnet-5.5"');
  });

  it("does not name a model where no question can be asked", () => {
    expect(html({ studiedName: null })).not.toContain("Model:");
    expect(html({ reason: "dailyLimit" })).not.toContain("Model:");
  });

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

  it("disables an unticked box once the most a merge takes are ticked, and only then", () => {
    const card = (tickDisabled: boolean, ticked = false) =>
      renderToStaticMarkup(
        <AnswerCard exchange={exchange(1, "Dative")} index={0} ticked={ticked} tickDisabled={tickDisabled} onTick={() => {}} onSave={() => {}} />,
      );
    expect(card(true)).toMatch(/<input type="checkbox"[^>]*disabled=""/);
    expect(card(false)).not.toContain("disabled");
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

describe("AnswerCard for a merged rule's draft", () => {
  const draft = {
    id: null, kind: "merge" as const, question: "Rule from 2 answers", mergeable: false,
    reply: { title: "Dative", topic: "Cases", blocks: [{ id: "b", kind: "text" as const, text: "body" }], sources: [], existingRule: null, relatedRules: [] },
  };
  const html = (onDiscard?: () => void) =>
    renderToStaticMarkup(<AnswerCard exchange={draft} index={0} ticked={null} onTick={() => {}} onSave={() => {}} onDiscard={onDiscard} />);

  it("offers Save as rule and Discard, and no tick box", () => {
    const out = html(() => {});
    expect(out).toContain("Save as rule");
    expect(out).toContain("Discard");
    expect(out).not.toContain("Include in a rule");
  });

  it("offers no Discard on an ordinary answer", () => {
    expect(html()).not.toContain("Discard");
  });
});

describe("AnswerCard for an answer already saved as a rule", () => {
  it("offers no second save", () => {
    const exchange = {
      id: 5, kind: "answer" as const, question: "q", mergeable: true,
      reply: { title: "Dative", topic: "Cases", blocks: [{ id: "b", kind: "text" as const, text: "body" }], sources: [], existingRule: null, relatedRules: [] },
    };
    const out = renderToStaticMarkup(<AnswerCard exchange={exchange} index={0} ticked={false} onTick={() => {}} onSave={() => {}} savedRuleId="r1" />);
    expect(out).not.toContain("Save as rule");
    // It can still be ticked for a merge.
    expect(out).toContain("Include in a rule");
  });
});
