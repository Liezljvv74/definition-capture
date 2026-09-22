import { describe, expect, it } from "vitest";

import { flagAfterAnswer } from "@/lib/flashcards";

/**
 * Whether answering a card should change the "needs review" flag.
 *
 * Both directions matter and they fail differently. Failing to set it on a
 * wrong answer leaves the filter collecting only what somebody remembered to
 * tick. Failing to clear it on a right answer is worse in the long run: the
 * item comes back for ever, the filter fills with things the reader knows, and
 * there is nothing on the review screen that would ever take it off again.
 *
 * `null` means "leave it alone", which is not the same as `false`: it is the
 * difference between deciding not to touch the flag and deciding to clear it.
 */
describe("flagAfterAnswer", () => {
  it("clears the flag when a flagged card is answered correctly", () => {
    expect(flagAfterAnswer({ correct: true, flagged: true, touchedByReader: false })).toBe(false);
  });

  it("sets it when an unflagged card is answered wrongly", () => {
    expect(flagAfterAnswer({ correct: false, flagged: false, touchedByReader: false })).toBe(true);
  });

  it("writes nothing when the flag already says what the answer said", () => {
    // No point spending a request to set true on something already true, and
    // a card nobody flagged and nobody got wrong should stay unflagged.
    expect(flagAfterAnswer({ correct: true, flagged: false, touchedByReader: false })).toBeNull();
    expect(flagAfterAnswer({ correct: false, flagged: true, touchedByReader: false })).toBeNull();
  });

  it("leaves the box alone once the reader has touched it", () => {
    // Ticking it while getting the card right is a deliberate "keep this one,
    // I was not sure", and clearing it a second later would be arguing.
    for (const correct of [true, false]) {
      for (const flagged of [true, false]) {
        expect(flagAfterAnswer({ correct, flagged, touchedByReader: true })).toBeNull();
      }
    }
  });
});
