import { describe, expect, it } from "vitest";

import { DEFAULT_ANSWER_SEPARATORS, readSeparators } from "@/lib/constants";
import {
  ANSWER_SEPARATORS,
  judgeAnswer,
  normaliseAnswer,
  similarity,
} from "@/lib/flashcards";

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
    expect(judgeAnswer("something else entirely at length", "door")).toBe(false);
  });
});

/**
 * A glossary entry often offers more than one English word for one German
 * one. Somebody who answers "gladly" for `gerne` knows the word; requiring
 * "gladly, willingly" in that order tests whether they can reproduce the
 * entry, which is a different and less useful thing to know.
 */
describe("judgeAnswer, when the back offers alternatives", () => {
  const gerne = "gladly, willingly";

  it("takes either one on its own", () => {
    expect(judgeAnswer("gladly", gerne)).toBe(true);
    expect(judgeAnswer("willingly", gerne)).toBe(true);
  });

  it("takes both, with the comma or without it", () => {
    expect(judgeAnswer("gladly, willingly", gerne)).toBe(true);
    expect(judgeAnswer("gladly willingly", gerne)).toBe(true);
  });

  it("takes them in the other order too", () => {
    // The entry's order is the glossary's, not a fact about the word.
    expect(judgeAnswer("willingly, gladly", gerne)).toBe(true);
    expect(judgeAnswer("willingly gladly", gerne)).toBe(true);
  });

  it("does not care about case or a trailing full stop", () => {
    expect(judgeAnswer("  Gladly. ", gerne)).toBe(true);
  });

  it("forgives a typo in one of them", () => {
    expect(judgeAnswer("willinglly", gerne)).toBe(true);
  });

  it("still refuses a word that is not one of them", () => {
    expect(judgeAnswer("happily", gerne)).toBe(false);
    expect(judgeAnswer("gladly, happily", gerne)).toBe(false);
  });

  it("refuses half of one of them", () => {
    expect(judgeAnswer("glad", gerne)).toBe(false);
  });

  it("handles three alternatives, any subset, any order", () => {
    const back = "gladly, willingly, with pleasure";
    expect(judgeAnswer("with pleasure", back)).toBe(true);
    expect(judgeAnswer("willingly, with pleasure", back)).toBe(true);
    expect(judgeAnswer("with pleasure gladly", back)).toBe(true);
    expect(judgeAnswer("gladly, willingly, with pleasure", back)).toBe(true);
    expect(judgeAnswer("with pleasure, sadly", back)).toBe(false);
  });

  it("does not let the same alternative count twice", () => {
    // "gladly gladly" is not two of the answers, it is one of them said twice.
    expect(judgeAnswer("gladly gladly", gerne)).toBe(false);
  });

  it("takes even a one-letter alternative, because it is still one of them", () => {
    // A guard against short answers was tried here and removed: if the back
    // says "a, an, the" then "a" is one of the answers, and refusing it would
    // be marking a correct answer wrong to defend against a card nobody has.
    expect(judgeAnswer("a", "a, an, the")).toBe(true);
    expect(judgeAnswer("an", "a, an, the")).toBe(true);
    expect(judgeAnswer("of", "a, an, the")).toBe(false);
  });

  it("is loose about a comma used inside a phrase, which is the price of this", () => {
    // Nothing can tell a separating comma from a parenthetical one without
    // understanding the sentence. Written down as a known cost rather than
    // discovered later: a back of "a good, honest man" accepts half of itself.
    expect(judgeAnswer("a good", "a good, honest man")).toBe(true);
  });

  it("leaves a back with no commas exactly as strict as it was", () => {
    expect(judgeAnswer("wooden path", "To be on the wooden path")).toBe(false);
  });
});

/**
 * A definition often qualifies itself rather than extending itself: "to go
 * (on foot)" says when the word applies, not what it means. Somebody who
 * answers "to go" has the word; the aside is the glossary being careful.
 */
describe("judgeAnswer, when the back has a bracketed aside", () => {
  const gehen = "to go (on foot)";

  it("takes the answer without the aside", () => {
    expect(judgeAnswer("to go", gehen)).toBe(true);
  });

  it("takes it with the aside, written either way", () => {
    expect(judgeAnswer("to go (on foot)", gehen)).toBe(true);
    expect(judgeAnswer("to go on foot", gehen)).toBe(true);
  });

  it("still refuses a different answer", () => {
    expect(judgeAnswer("to drive", gehen)).toBe(false);
    expect(judgeAnswer("on foot", gehen)).toBe(false);
  });

  it("works on an aside inside one of several alternatives", () => {
    const back = "to go (on foot), to walk";
    expect(judgeAnswer("to go", back)).toBe(true);
    expect(judgeAnswer("to walk", back)).toBe(true);
    expect(judgeAnswer("to go on foot", back)).toBe(true);
    expect(judgeAnswer("to go, to walk", back)).toBe(true);
    expect(judgeAnswer("to walk to go", back)).toBe(true);
    expect(judgeAnswer("to run", back)).toBe(false);
  });

  it("copes with an aside at the front", () => {
    expect(judgeAnswer("tired", "(feeling) tired")).toBe(true);
    expect(judgeAnswer("feeling tired", "(feeling) tired")).toBe(true);
  });
});

describe("judgeAnswer, when alternatives are separated by a slash", () => {
  const gerne = "gladly/willingly";

  it("takes either one", () => {
    expect(judgeAnswer("gladly", gerne)).toBe(true);
    expect(judgeAnswer("willingly", gerne)).toBe(true);
  });

  it("takes both, however they are punctuated", () => {
    expect(judgeAnswer("gladly/willingly", gerne)).toBe(true);
    expect(judgeAnswer("gladly willingly", gerne)).toBe(true);
    // Answering with a comma when the entry used a slash is not a mistake.
    expect(judgeAnswer("gladly, willingly", gerne)).toBe(true);
    expect(judgeAnswer("willingly gladly", gerne)).toBe(true);
  });

  it("still refuses something that is neither", () => {
    expect(judgeAnswer("happily", gerne)).toBe(false);
  });

  it("handles a slash with spaces around it", () => {
    expect(judgeAnswer("gladly", "gladly / willingly")).toBe(true);
  });

  it("handles both separators in one answer", () => {
    const back = "gladly, willingly/happily";
    expect(judgeAnswer("happily", back)).toBe(true);
    expect(judgeAnswer("gladly", back)).toBe(true);
    expect(judgeAnswer("sadly", back)).toBe(false);
  });
});

describe("the separators are configurable", () => {
  it("defaults to a comma and a slash", () => {
    expect(ANSWER_SEPARATORS).toBe(",/");
    expect(DEFAULT_ANSWER_SEPARATORS).toBe(",/");
  });

  it("can be told to use something else instead", () => {
    const back = "gladly; willingly";
    // Not a separator by default, so the whole thing is one answer.
    expect(judgeAnswer("gladly", back)).toBe(false);
    // Told that it is, either half will do.
    expect(judgeAnswer("gladly", back, ";")).toBe(true);
    expect(judgeAnswer("willingly", back, ";")).toBe(true);
  });

  it("stops treating a character as a separator when it is left out", () => {
    // The trade named in the comment on `ANSWER_SEPARATORS`: with the slash
    // separating, "and/or" is two answers; without it, one.
    expect(judgeAnswer("and", "and/or")).toBe(true);
    expect(judgeAnswer("and", "and/or", ",")).toBe(false);
    expect(judgeAnswer("and/or", "and/or", ",")).toBe(true);
  });

  it("escapes what it is given, so a regex character cannot break it", () => {
    expect(judgeAnswer("gladly", "gladly] willingly", "]")).toBe(true);
    expect(judgeAnswer("gladly", "gladly- willingly", "-")).toBe(true);
  });
});

/**
 * What a stored setting is allowed to be.
 *
 * This is the guard between a row, or a backup file, and the marker. The
 * damage a bad value does is quiet rather than loud: a letter in here splits
 * every answer containing that letter, marking stops agreeing with itself,
 * and nothing points at a settings change made weeks ago. The database
 * refuses the same things, so this is the rule said twice on purpose.
 */
describe("readSeparators", () => {
  it("keeps the characters that are actually on offer", () => {
    expect(readSeparators(",/")).toBe(",/");
    expect(readSeparators(";")).toBe(";");
    expect(readSeparators("|")).toBe("|");
  });

  it("drops anything that is not one of them", () => {
    // A letter is the dangerous case: "a" would split every answer with an
    // "a" in it, and marking would quietly stop working.
    expect(readSeparators("a")).toBe("");
    expect(readSeparators(",a/")).toBe(",/");
    expect(readSeparators(" ")).toBe("");
    expect(readSeparators(".")).toBe("");
  });

  it("takes an empty setting at its word", () => {
    // Turning them all off is a real choice: answers are then marked exactly
    // as they are written.
    expect(readSeparators("")).toBe("");
    expect(judgeAnswer("gladly", "gladly, willingly", readSeparators(""))).toBe(false);
  });

  it("puts them in a settled order, so the same choice is one string", () => {
    expect(readSeparators("/,")).toBe(readSeparators(",/"));
  });

  it("does not repeat one that was stored twice", () => {
    expect(readSeparators(",,,")).toBe(",");
  });

  it("treats anything that is not a string as nothing chosen", () => {
    for (const nonsense of [null, undefined, 42, {}, [","]]) {
      expect(readSeparators(nonsense)).toBe("");
    }
  });
});
