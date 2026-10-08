import { describe, expect, it } from "vitest";

import { beginReading, finishReading, stopReading } from "@/lib/useSpeech";

/** A reading's stop, counting how often it was called. */
function reading() {
  const calls = { stopped: 0 };
  return { calls, stop: () => void (calls.stopped += 1) };
}

describe("one reading at a time", () => {
  it("stops the reading before when another starts", () => {
    const a = reading();
    const b = reading();
    beginReading("word:1", a.stop);
    beginReading("word:2", b.stop);
    expect(a.calls.stopped).toBe(1);
    stopReading("word:2");
    expect(b.calls.stopped).toBe(1);
  });

  it("lets a button stop only its own reading", () => {
    const a = reading();
    beginReading("word:1", a.stop);
    stopReading("word:9");
    expect(a.calls.stopped).toBe(0);
    stopReading("word:1");
    expect(a.calls.stopped).toBe(1);
    // Nothing is reading now, so a new reading has nothing to stop.
    beginReading("word:2", reading().stop);
    expect(a.calls.stopped).toBe(1);
    stopReading("word:2");
  });

  it("does not let an old reading's end clear a newer one", () => {
    const b = reading();
    beginReading("word:1", reading().stop);
    beginReading("word:2", b.stop);
    finishReading("word:1");
    // Word 2 is still the reading, so the next one stops it.
    const c = reading();
    beginReading("word:3", c.stop);
    expect(b.calls.stopped).toBe(1);
    finishReading("word:3");
    // Finished means cleared: the next reading stops nothing.
    beginReading("word:4", reading().stop);
    expect(c.calls.stopped).toBe(0);
    finishReading("word:4");
  });
});
