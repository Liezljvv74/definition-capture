import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const insert = vi.fn();
const update = vi.fn();
let settledResolve: () => void = () => {};
vi.mock("@/lib/rules", () => ({
  settled: () => new Promise<void>((resolve) => { settledResolve = () => { calls.push("settled"); resolve(); }; }),
}));
vi.mock("@/lib/supabaseClient", () => ({
  getSupabase: () => ({
    from: () => ({
      insert: (row: unknown) => { calls.push("insert"); return insert(row); },
      update: (row: unknown) => ({ eq: () => update(row) }),
    }),
  }),
}));

import { recordSavedRule, renameConversation } from "./tutorConversations";

beforeEach(() => {
  calls.length = 0;
  vi.resetAllMocks();
});

describe("recordSavedRule", () => {
  it("waits for the rule's own save before recording the link", async () => {
    insert.mockResolvedValue({ error: null });
    const done = recordSavedRule("c1", "r1", 7);
    await Promise.resolve();
    expect(calls).toEqual([]);
    settledResolve();
    await done;
    expect(calls).toEqual(["settled", "insert"]);
    expect(insert).toHaveBeenCalledWith({ conversation_id: "c1", item_id: "r1", exchange_id: 7 });
  });

  it.each(["23503", "23505"])("stays quiet when the database refuses the link with %s", async (code) => {
    insert.mockResolvedValue({ error: { code } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const done = recordSavedRule("c1", "r1", 7);
    settledResolve();
    await expect(done).resolves.toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });
});

describe("renameConversation", () => {
  it("refuses a blank name without writing", async () => {
    expect(await renameConversation("c1", "   ")).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
  it("trims and cuts the name to 120 characters", async () => {
    update.mockResolvedValue({ error: null });
    expect(await renameConversation("c1", `  ${"x".repeat(130)}  `)).toBe(true);
    expect(update).toHaveBeenCalledWith({ name: "x".repeat(120) });
  });
});
