import { beforeEach, describe, expect, it, vi } from "vitest";

const countUsage = vi.fn();
const recordQuestion = vi.fn();
vi.mock("@/lib/tutorServer", () => ({
  countUsage: (...a: unknown[]) => countUsage(...a),
  recordQuestion: (...a: unknown[]) => recordQuestion(...a),
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import { reserveMessage } from "@/lib/reserveMessage";

const supabase = {} as SupabaseClient;

beforeEach(() => {
  vi.resetAllMocks();
});

describe("reserveMessage", () => {
  it("tries a failed re-count once more, since the reserved message cannot be given back", async () => {
    countUsage.mockRejectedValueOnce(new Error("blip")).mockResolvedValueOnce({ usedTotal: 1, usedToday: 1 });
    expect(await reserveMessage(supabase, "u1", "free")).toEqual({ left: 4, reason: "ok" });
    expect(recordQuestion).toHaveBeenCalledTimes(1);
    expect(countUsage).toHaveBeenCalledTimes(2);
  });

  it("gives up when the re-count fails twice", async () => {
    countUsage.mockRejectedValue(new Error("down"));
    await expect(reserveMessage(supabase, "u1", "free")).rejects.toThrow();
  });
});
