import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";
import { saveExchange, signTurn, verifiedTurns } from "@/lib/tutorServer";

/**
 * The reply signature is what keeps a made-up "earlier reply" from reaching
 * the model, so these pin that a saved reply verifies and nothing else does.
 */
beforeEach(() => {
  vi.stubEnv("OPENROUTER_API_KEY", "sk-test");
});

describe("reply signatures", () => {
  it("saves a reply with a signature that verifies, for that account only", async () => {
    let rows: { role: string; content: string; signature?: string }[] = [];
    const supabase = {
      from: () => ({
        insert: async (given: typeof rows) => {
          rows = given;
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient;
    await saveExchange(supabase, "u1", "question", "answer");

    expect(rows[0]).not.toHaveProperty("signature");
    expect(verifiedTurns("u1", rows as never)).toEqual([
      { role: "user", content: "question" },
      { role: "assistant", content: "answer" },
    ]);
    expect(verifiedTurns("u2", rows as never)).toEqual([{ role: "user", content: "question" }]);
  });

  it("drops a reply that is unsigned, edited, or signed under another key", () => {
    const signature = signTurn("u1", "the real reply");
    const kept = verifiedTurns("u1", [
      { role: "assistant", content: "the real reply", signature },
      { role: "assistant", content: "the real reply, edited", signature },
      { role: "assistant", content: "no signature" },
      { role: "assistant", content: "short signature", signature: "ab" },
    ]);
    expect(kept).toEqual([{ role: "assistant", content: "the real reply" }]);

    vi.stubEnv("OPENROUTER_API_KEY", "sk-rotated");
    expect(verifiedTurns("u1", [{ role: "assistant", content: "the real reply", signature }])).toEqual([]);
  });
});
