import { describe, expect, it, vi } from "vitest";

import { fromRuleRow, parseRule, toRulePayload, toWireRule } from "@/lib/rules";
import type { Rule } from "@/lib/types";

vi.mock("@/lib/supabaseClient", () => ({ getSupabase: () => null }));
vi.mock("@/lib/session", () => ({
  currentUserId: () => "user-1",
  subscribe: () => () => {},
}));

/**
 * The rule store's codecs: an `items` row in, a `save_items` payload out, and
 * the backup shape between. Nothing here fails loudly when it drifts, which
 * is why each direction is pinned.
 */
const rule: Rule = {
  id: "7f3b1c88-0c4e-4f4a-9a2b-0c2b3f9f5a11",
  title: "Dative",
  topic: "Cases",
  blocks: [{ kind: "text", id: "b1", text: "Wem?" }],
  dateAdded: "2026-02-03T09:15:00.000Z",
  dateUpdated: null,
};

const row = {
  id: rule.id,
  title: "Dative",
  topic: "Cases",
  blocks: [{ kind: "text", id: "b1", text: "Wem?" }],
  created_at: "2026-02-03T09:15:00.000Z",
  updated_at: "2026-02-03T09:15:00.000Z",
};

describe("fromRuleRow", () => {
  it("reads every field", () => {
    expect(fromRuleRow(row)).toEqual(rule);
  });

  it("reads an updated_at that differs from created_at as an edit", () => {
    expect(fromRuleRow({ ...row, updated_at: "2026-03-01T00:00:00.000Z" })?.dateUpdated).toBe(
      "2026-03-01T00:00:00.000Z",
    );
  });

  it("refuses a row with no id or no title", () => {
    expect(fromRuleRow({ ...row, id: "" })).toBeNull();
    expect(fromRuleRow({ ...row, title: " " })).toBeNull();
  });
});

describe("toRulePayload", () => {
  it("writes the keys save_items reads, and never an owner", () => {
    expect(toRulePayload(rule)).toEqual({
      id: rule.id,
      title: "Dative",
      topic: "Cases",
      blocks: rule.blocks,
      created_at: rule.dateAdded,
      updated_at: undefined,
    });
  });
});

describe("the backup shape", () => {
  it("survives a round trip", () => {
    expect(parseRule(toWireRule(rule))).toEqual(rule);
  });

  it("stands in today's date and a fresh id where a hand-written file has none", () => {
    const parsed = parseRule({ title: "Genitive", topic: "Cases" }, true);
    expect(parsed?.id).toBe("");
    expect(parsed?.blocks).toEqual([]);
    expect(Number.isNaN(Date.parse(parsed?.dateAdded ?? ""))).toBe(false);
  });

  it("refuses a rule without a title", () => {
    expect(parseRule({ id: "x", topic: "Cases" })).toBeNull();
  });
});
