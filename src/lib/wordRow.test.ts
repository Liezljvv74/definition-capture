import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabaseClient", () => ({ getSupabase: () => null }));

import { fromWordRow, parseEntry, toWordPayload } from "@/lib/storage";

/**
 * The needs-review mark on a word: read from the row, kept out of every save,
 * and absent from a backup. The save half is the one that loses data if it
 * drifts, because `save_items` only keeps the stored mark while the payload
 * leaves the key out.
 */
const row = {
  id: "0b6f2c1e-6a51-4d1b-9a43-2c8f0d7e5b10",
  title: "Tür",
  definition: "door",
  created_at: "2026-02-03T09:15:00.000Z",
  updated_at: "2026-02-03T09:15:00.000Z",
};

describe("a word's needs-review mark", () => {
  it("is read off the row", () => {
    expect(fromWordRow({ ...row, needs_review: true })?.needsReview).toBe(true);
    expect(fromWordRow(row)?.needsReview).toBe(false);
  });

  it("is never sent with the word", () => {
    const marked = fromWordRow({ ...row, needs_review: true });
    if (!marked) throw new Error("the row should read");
    const payload = toWordPayload(marked);
    expect(payload).not.toHaveProperty("needs_review");
    expect(payload).not.toHaveProperty("needsReview");
  });

  it("is not taken from a backup file", () => {
    expect(parseEntry({ id: row.id, word: "Tür", needsReview: true })?.needsReview).toBe(false);
  });
});
