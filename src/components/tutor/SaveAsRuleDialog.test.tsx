import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const rules = [
  { id: "r1", title: "Dative", topic: "Cases", blocks: [], dateAdded: "", dateUpdated: null },
  { id: "r2", title: "Word order", topic: "Syntax", blocks: [], dateAdded: "", dateUpdated: null },
];
vi.mock("@/lib/useRules", () => ({ useRules: () => ({ rules, loaded: true, error: null }) }));
vi.mock("@/lib/rules", async (orig) => ({
  ...(await orig<typeof import("@/lib/rules")>()),
  findByTitle: (title: string) => rules.find((r) => r.title.toLowerCase() === title.toLowerCase()),
}));
vi.mock("@/components/Modal", () => ({ Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

import { SaveAsRuleDialog } from "./SaveAsRuleDialog";

const reply = { title: "Accusative", topic: "Cases", blocks: [], sources: [], existingRule: null, relatedRules: ["Word order"] };

describe("SaveAsRuleDialog", () => {
  it("names the rules saved from this conversation, offers the tutor's suggestions, and a search for any other rule", () => {
    const out = renderToStaticMarkup(<SaveAsRuleDialog reply={reply} linkedRuleIds={["r1", "gone"]} onSaved={() => {}} onClose={() => {}} />);
    expect(out).toContain("Dative");
    expect(out).toContain("Word order");
    expect(out).toContain("Link another rule");
    expect(out).not.toContain("gone");
  });
});
