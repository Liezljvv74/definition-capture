import { describe, expect, it } from "vitest";

import { judgeAnswer, normaliseAnswer, similarity } from "@/lib/flashcards";

/**
 * Whether a typed answer counts as right.
 *
 * This decides what the reader is told about their own knowledge, so both
 * kinds of mistake are worth guarding. Refusing a right answer is annoying and
 * recoverable, since the card offers try again and see the answer. Accepting a
 * wrong one tells somebody they know a word they do not, schedules it weeks
 * away, and there is nothing to notice.
 */
describe("normaliseAnswer", () => {
  it("ignores case, surrounding punctuation and stray spacing", () => {
    expect(normaliseAnswer("  Door.  ")).toBe("door");
    expect(normaliseAnswer("door!")).toBe("door");
    expect(normaliseAnswer("a  door")).toBe("a door");
    expect(normaliseAnswer("(door)")).toBe("door");
  });

  it("keeps accents, because they are the point of the exercise", () => {
    // `Tür` and `Tur` are different words. A grader that shrugs at the umlaut
    // is teaching the wrong thing, however kind it feels.
    expect(normaliseAnswer("Tür")).not.toBe(normaliseAnswer("Tur"));
  });

  it("settles how an accent is encoded, which is not the same as removing it", () => {
    // The same word typed on a Mac can arrive decomposed. That is an encoding
    // difference, not a spelling one.
    expect(normaliseAnswer("Tür")).toBe(normaliseAnswer("Tür"));
  });
});

describe("similarity", () => {
  it("is 1 for the same string and 0 against nothing", () => {
    expect(similarity("door", "door")).toBe(1);
    expect(similarity("door", "")).toBe(0);
  });

  it("falls with each character that differs", () => {
    expect(similarity("door", "doar")).toBeCloseTo(0.75, 2);
    expect(similarity("door", "cat")).toBeLessThan(0.3);
  });
});

describe("judgeAnswer", () => {
  it("accepts the answer as written", () => {
    expect(judgeAnswer("door", "door")).toBe(true);
    expect(judgeAnswer("  DOOR. ", "door")).toBe(true);
  });

  it("refuses an empty answer, so Enter on a blank box is not a free pass", () => {
    expect(judgeAnswer("", "door")).toBe(false);
    expect(judgeAnswer("   ", "door")).toBe(false);
  });

  it("forgives a typo in a long answer", () => {
    expect(judgeAnswer("to be on the wooden path", "To be on the wooden path")).toBe(true);
    expect(judgeAnswer("to be on the wodden path", "To be on the wooden path")).toBe(true);
  });

  it("does not forgive one in a short answer, where a letter is most of it", () => {
    // 0.85 of a four-letter word leaves no room, which is the right answer:
    // "door" and "doer" are not a typo apart in any useful sense.
    expect(judgeAnswer("doer", "door")).toBe(false);
  });

  it("refuses a different answer that happens to share words", () => {
    expect(judgeAnswer("the wooden path", "To be on the wooden path")).toBe(false);
    expect(judgeAnswer("door", "a door; an entrance")).toBe(false);
  });

  it("takes any one line of a multi-part back", () => {
    // A phrase carries its literal meaning and an example, and nobody is
    // going to type both.
    const back = "To be on the wooden path\n\nDu bist auf dem Holzweg.";
    expect(judgeAnswer("to be on the wooden path", back)).toBe(true);
    expect(judgeAnswer("Du bist auf dem Holzweg.", back)).toBe(true);
  });

  it("takes one person's line from a conjugation table", () => {
    const back = "ich: Present gehe\ndu: Present gehst";
    expect(judgeAnswer("du: Present gehst", back)).toBe(true);
    expect(judgeAnswer("er: Present geht", back)).toBe(false);
  });

  it("still accepts the whole back typed out", () => {
    const back = "To be on the wooden path\n\nDu bist auf dem Holzweg.";
    expect(judgeAnswer(back, back)).toBe(true);
  });

  it("is not fooled by an answer that is merely long", () => {
    expect(judgeAnswer("something else entirely, at length", "door")).toBe(false);
  });
});
