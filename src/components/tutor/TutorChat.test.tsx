import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TutorChat } from "@/components/tutor/TutorChat";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const base = { remaining: 26, reason: "ok", plan: "paid", studiedName: "German", nativeName: "English" } as const;
const html = (props: Partial<Parameters<typeof TutorChat>[0]> = {}) =>
  renderToStaticMarkup(<TutorChat {...base} {...props} />);

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
});
