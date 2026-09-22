import { describe, expect, it } from "vitest";

import { localDayOf } from "@/lib/flashcards";

/**
 * The day a review is filed under.
 *
 * It is the only input to the streak, and it is unrecoverable if it is wrong:
 * `daily_study` is a counter rather than a log, `review_logs.reviewed_at` is
 * UTC, and the reader's offset is stored nowhere, so there is nothing to
 * replay from. Dropping the `+ 1` on the month, or reaching for
 * `toISOString().slice(0, 10)` because it is shorter, would file every review
 * under the wrong day and nothing on screen would say so.
 *
 * `new Date(y, m, d, ...)` builds a local time, which is the whole point: the
 * assertions below are true in every time zone this can run in.
 */
describe("localDayOf", () => {
  it("pads the month and the day to two digits", () => {
    expect(localDayOf(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(localDayOf(new Date(2026, 8, 9))).toBe("2026-09-09");
  });

  it("counts months from one, not from zero", () => {
    expect(localDayOf(new Date(2026, 11, 25))).toBe("2026-12-25");
  });

  it("keeps a late-evening review on the day the reader is having", () => {
    // Half past eleven on New Year's Eve is still the 31st, which is what
    // `toISOString` would get wrong for anyone east of Greenwich.
    expect(localDayOf(new Date(2026, 11, 31, 23, 30))).toBe("2026-12-31");
    expect(localDayOf(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01");
  });
});
