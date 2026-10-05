// Apart from `tutorServer.ts`, so that a test which mocks the reads and the
// write there reaches them through this module's imports; a call between two
// functions of one module never goes through its mocked exports.

import type { SupabaseClient } from "@supabase/supabase-js";
import { allowance, type Plan } from "@/lib/tutor";
import { countUsage, recordQuestion } from "@/lib/tutorServer";

/**
 * Spends one message and says what is left once it is spent. The row is this
 * request's place in line: N parallel requests each insert before any of them
 * re-counts, so each sees the others and the limit holds. Checking once and
 * recording after the call, as the tutor once did, let every parallel request
 * see the old count. A request that lost the race is refused and its row
 * stays: a spent reservation is not given back. Throws when either the insert
 * or the re-count fails, since a failed count must not read as nothing used.
 */
export async function reserveMessage(
  supabase: SupabaseClient,
  userId: string,
  plan: Plan,
): Promise<{ left: number; reason: ReturnType<typeof allowance>["reason"] }> {
  await recordQuestion(supabase, userId);
  const usage = await countUsage(supabase);
  // The counts include the row just inserted, and `allowance` wants what was
  // used before this request.
  const { remaining, reason } = allowance({ plan, usedTotal: usage.usedTotal - 1, usedToday: usage.usedToday - 1 });
  return { left: Math.max(0, remaining - 1), reason };
}
