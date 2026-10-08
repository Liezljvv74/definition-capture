import { describe, expect, it, vi } from "vitest";

import { readTenseRecord, recordTenses } from "@/lib/verbPracticeData";

/*
 * `recordTenses` calls `recordTense` inside its own module, where a mock of
 * that module cannot reach, so the client underneath is mocked instead.
 */
const sent: string[] = [];
vi.mock("@/lib/supabaseClient", () => ({
  getSupabase: () => ({
    rpc: async (_name: string, args: { target_tense: string }) => {
      sent.push(args.target_tense);
      return { error: args.target_tense === "Perfekt" ? { message: "offline" } : null };
    },
  }),
}));

describe("readTenseRecord", () => {
  it("reads a row and refuses one without an item or a tense", () => {
    expect(readTenseRecord({ item_id: "v1", tense: "Präsens", streak: 2, times_seen: 3, due_at: "2026-10-09T00:00:00Z" }))
      .toEqual({ itemId: "v1", tense: "Präsens", streak: 2, timesSeen: 3, dueAt: "2026-10-09T00:00:00Z" });
    expect(readTenseRecord({ tense: "Präsens" })).toBeNull();
    expect(readTenseRecord({ item_id: "v1" })).toBeNull();
    expect(readTenseRecord(null)).toBeNull();
  });
});

describe("recordTenses", () => {
  it("sends every tense even when one fails, and names the ones that failed", async () => {
    const failed = await recordTenses(
      "v1",
      [{ tense: "Präsens", right: true }, { tense: "Perfekt", right: false }, { tense: "Futur", right: true }],
      1200,
    );
    expect(sent).toEqual(["Präsens", "Perfekt", "Futur"]);
    expect(failed).toEqual([{ tense: "Perfekt", right: false }]);
  });
});
