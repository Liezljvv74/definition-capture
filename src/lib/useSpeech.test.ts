import { describe, expect, it } from "vitest";

import { beginReading, finishReading, readingKey, stopReading } from "@/lib/useSpeech";

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
    expect(readingKey()).toBe("word:2");
    stopReading("word:2");
  });

  it("lets a button stop only its own reading", () => {
    const a = reading();
    beginReading("word:1", a.stop);
    stopReading("word:9");
    expect(a.calls.stopped).toBe(0);
    expect(readingKey()).toBe("word:1");
    stopReading("word:1");
    expect(a.calls.stopped).toBe(1);
    expect(readingKey()).toBeNull();
  });

  it("does not let an old reading's end clear a newer one", () => {
    beginReading("word:1", reading().stop);
    beginReading("word:2", reading().stop);
    finishReading("word:1");
    expect(readingKey()).toBe("word:2");
    finishReading("word:2");
    expect(readingKey()).toBeNull();
  });
});
