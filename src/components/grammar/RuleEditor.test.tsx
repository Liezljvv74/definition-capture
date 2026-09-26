import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { RuleEditor } from "@/components/grammar/RuleEditor";
import type { Rule } from "@/lib/types";

vi.mock("@/lib/supabaseClient", () => ({ getSupabase: () => null }));
vi.mock("@/lib/session", () => ({
  currentUserId: () => "user-1",
  subscribe: () => () => {},
}));

/**
 * Rendered to a string, as `BlockView.test.tsx` is: this pins Review Focus 1,
 * that a blank topic disables Save and says why, rather than only failing
 * silently once Save is clicked.
 */
const rule: Rule = {
  id: "r1",
  title: "Dative",
  topic: "Cases",
  blocks: [],
  dateAdded: "2026-02-03T09:15:00.000Z",
  dateUpdated: null,
};

const html = (given: Rule) =>
  renderToStaticMarkup(
    <RuleEditor rule={given} topics={[]} onSave={() => {}} onCancel={() => {}} />,
  );

describe("RuleEditor", () => {
  it("disables Save and shows the reason when the rule has no topic", () => {
    const markup = html({ ...rule, topic: "" });
    expect(markup).toContain("A rule needs a topic.");
    expect(markup).toMatch(/<button type="submit"[^>]*disabled=""/);
  });

  it("enables Save once the rule has a title and a topic", () => {
    const markup = html(rule);
    expect(markup).not.toContain("A rule needs a topic.");
    expect(markup).not.toMatch(/<button type="submit"[^>]*disabled=""/);
  });
});
