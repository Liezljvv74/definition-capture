import { describe, expect, it } from "vitest";

import { readTenseRecord, recordTenses } from "@/lib/verbPracticeData";

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
    const sent: string[] = [];
    const failed = await recordTenses(
      "v1",
      [{ tense: "Präsens", right: true }, { tense: "Perfekt", right: false }, { tense: "Futur", right: true }],
      1200,
      async (_item, tense) => {
        sent.push(tense);
        if (tense === "Perfekt") throw new Error("offline");
      },
    );
    expect(sent).toEqual(["Präsens", "Perfekt", "Futur"]);
    expect(failed).toEqual([{ tense: "Perfekt", right: false }]);
  });
});
