import { describe, expect, it, vi } from "vitest";

import { createRule, deleteRules, findByTitle, getRules, fromRuleRow, parseRule, titleProblem, toRulePayload, toWireRule } from "@/lib/rules";
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

  it("refuses a rule without a topic, rather than sinking the whole import batch", () => {
    // `save_items` refuses a rule with no topic for the whole call, up to 500
    // rows at once, after the import dialog has already shown a success count.
    // Treating a blank topic as unreadable here, like a missing title, keeps
    // one bad row from taking the rest of the file down with it.
    expect(parseRule({ id: "x", title: "Dative", topic: " " })).toBeNull();
    expect(parseRule({ id: "x", title: "Dative" })).toBeNull();
  });
});

describe("titleProblem", () => {
  it("is null for a title with none of the link characters", () => {
    expect(titleProblem("Dativ")).toBeNull();
  });

  it("names the character for a title holding |, [ or ]", () => {
    const message = "A title cannot contain |, [ or ], because links are written with them.";
    expect(titleProblem("a|b")).toBe(message);
    expect(titleProblem("a[b")).toBe(message);
    expect(titleProblem("a]b")).toBe(message);
  });
});

describe("createRule", () => {
  it("carries the given blocks in the one insert, so no second save can race it", () => {
    const created = createRule({ title: "Saved", topic: "Cases", blocks: rule.blocks });
    expect(created.blocks).toEqual(rule.blocks);
    expect(findByTitle("Saved")?.blocks).toEqual(rule.blocks);
    expect(createRule({ title: "Empty", topic: "Cases" }).blocks).toEqual([]);
  });
});

describe("findByTitle", () => {
  it("matches case-insensitively, excludes the rule named by its own id, and is undefined for no match", () => {
    // Review Focus 5: a duplicate title differing only in case must be
    // refused the same way the database's unique index would refuse it,
    // matching by `foldName` the way every name in the app is matched.
    const created = createRule({ title: "Dative", topic: "Cases" });
    expect(findByTitle("DATIVE")?.id).toBe(created.id);
    expect(findByTitle("Dative", created.id)).toBeUndefined();
    expect(findByTitle("Genitive")).toBeUndefined();
  });
});

describe("a rule's topic", () => {
  it("is cut to the 60 characters a tag may hold, so the save cannot fail on it", () => {
    const long = "Which case German prepositions need: always dative, or dative or accusative depending on where or where to";
    const rule = createRule({ title: "Prepositions and cases", topic: long });
    expect(rule.topic.length).toBeLessThanOrEqual(60);
    expect(long.startsWith(rule.topic)).toBe(true);
    expect(rule.topic).toBe(rule.topic.trim());
  });
});

describe("deleting a rule", () => {
  it("leaves no link to it in the rules that linked to it", () => {
    const gone = createRule({ title: "Zu loeschen", topic: "Test" });
    const other = createRule({
      title: "Verweist",
      topic: "Test",
      blocks: [
        { id: "x1", kind: "text", text: "Compare [[Zu loeschen]]." },
        { id: "x2", kind: "text", text: "See also [[Zu loeschen]]." },
      ],
    });
    deleteRules([gone.id]);
    const after = getRules().find((r) => r.id === other.id)!;
    expect(after.blocks.map((b) => ("text" in b ? b.text : ""))).toEqual(["Compare Zu loeschen."]);
    expect(getRules().some((r) => r.id === gone.id)).toBe(false);
  });
});
