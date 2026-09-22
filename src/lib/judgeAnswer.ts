/**
 * Whether what was typed counts as the answer on the back of a card.
 *
 * Its own module because it is a pure string algorithm: no Supabase, no
 * session, nothing to mock. It lived in `flashcards.ts` beside the data
 * access, which meant importing the marking rule pulled the browser client in
 * with it, and the test file has been called `judgeAnswer.test.ts` since the
 * day it was written, naming a module that did not exist.
 *
 * The rule it implements is a trade the reader controls: which characters
 * separate one acceptable answer from the next is a setting, because whether
 * "gladly, willingly" is one answer or two depends on how they write their own
 * entries.
 */

import { DEFAULT_ANSWER_SEPARATORS } from "@/lib/constants";

/**
 * The comparable form of an answer.
 *
 * Case and surrounding punctuation are noise: "Door." and "door" are the same
 * answer. Whitespace is collapsed so a stray double space is not a mistake.
 *
 * Accents are deliberately kept. This is an app for learning a language where
 * `Tür` and `Tur` are different words, and quietly accepting one for the other
 * would teach the wrong thing. `normalize("NFC")` only settles how an accent
 * is encoded, not whether it is there.
 */
export function normaliseAnswer(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[.,;:!?"'()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * How alike two strings are, from 0 to 1, by edit distance over the longer of
 * them. Used only to forgive a typo, never to accept a different answer.
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  // One row at a time rather than the whole matrix: these are short strings,
  // but there is no reason to hold a table of them.
  let previous = Array.from({ length: b.length + 1 }, (_, at) => at);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }

  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

/**
 * Close enough to count as a typo rather than a different answer. At 0.85 a
 * ten-character answer may be one character out; a short one must be exact,
 * which is right, because in a short word every character is most of it.
 */
const CLOSE_ENOUGH = 0.85;

/** A character class matching any of them, escaped for use inside one. */
function separatorPattern(separators: string): RegExp {
  return new RegExp(`[${separators.replace(/[\\\]^-]/g, (c) => `\\${c}`)}]`, "g");
}

/**
 * The same text with any bracketed aside taken out.
 *
 * A definition often qualifies itself: "to go (on foot)". The part in
 * brackets is a note about when the word applies, not part of the answer, so
 * both readings count. Answering with the brackets works already, because
 * normalising turns them into spaces; this is what makes answering without
 * them work too.
 *
 * Innermost brackets only, and no attempt at nesting. A definition with
 * brackets inside brackets is not a thing this app has, and a regex that
 * tried would be harder to read than the problem deserves.
 */
function withoutAsides(text: string): string {
  return text.replace(/\([^()]*\)/g, " ");
}

/** The same string, or near enough to be a typo rather than another answer. */
function alike(given: string, candidate: string): boolean {
  if (given === candidate) return true;

  // An accent is not a typo, whatever the length of the word. `normaliseAnswer`
  // deliberately keeps accents, because `Tür` and `Tur` are different words,
  // and the threshold below was quietly undoing that for anything long enough
  // that one character in nine fell under it: "gemutlich" was accepted for
  // "gemütlich" while "schon" was refused for "schön", so the rule depended on
  // word length, which nobody could have predicted from the screen. It is the
  // same at every length now, and it is the stricter reading, because which
  // vowel it is happens to be the thing being learned.
  if (withoutAccents(given) === withoutAccents(candidate)) return false;

  return similarity(given, candidate) >= CLOSE_ENOUGH;
}

/**
 * The same text with its accents stripped, for telling "these differ only by
 * an accent" from "these differ by a slip of the finger". Decomposing and
 * dropping the combining marks covers the whole range, rather than a list of
 * letters somebody has to remember to extend.
 */
function withoutAccents(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/**
 * Whether what was typed is some combination of the alternatives, in any
 * order, and nothing else.
 *
 * Commas have already become spaces by the time this runs, which is what
 * makes "gladly, willingly" and "gladly willingly" the same thing to it.
 * Written so that an alternative may be several words: it eats the longest
 * thing it recognises from the front and tries again with the rest, and each
 * alternative may be used once.
 *
 * Exact rather than forgiving, deliberately. A typo inside one of several
 * run-together answers cannot be told apart from a different answer without
 * guessing where one ends and the next begins, and guessing is how a marker
 * starts accepting things nobody wrote.
 */
function madeOf(given: string, alternatives: readonly string[]): boolean {
  if (given === "") return true;

  return alternatives.some((alternative, at) => {
    if (alternative === "") return false;
    if (given === alternative) return true;
    if (!given.startsWith(`${alternative} `)) return false;

    const rest = alternatives.filter((_, other) => other !== at);
    return madeOf(given.slice(alternative.length + 1), rest);
  });
}

/**
 * Whether a typed answer matches the back of the card.
 *
 * The back is not always one thing, in two different ways.
 *
 * It may be several lines: a phrase carries its literal meaning and an
 * example separated by a blank line, and a verb table is a line per person.
 * Nobody is going to type all of that, so each line counts on its own.
 *
 * And a line may offer alternatives, separated by a comma or a slash. `gerne`
 * means "gladly, willingly", and somebody who answers "gladly" knows the word.
 * Requiring both, in that order, with the comma, tests whether they can
 * reproduce a glossary entry rather than whether they know what it means. So
 * any one of the alternatives is accepted, as is any combination of them, in
 * any order, with or without the separators.
 *
 * A line may also qualify itself in brackets: "to go (on foot)". Where the
 * reader has said brackets are one of their separators, the aside is taken as
 * saying when the word applies rather than what it means, so the answer counts
 * with it and without it. Where they have not, the brackets are ordinary
 * punctuation and the aside is part of the answer.
 *
 * Each line is therefore tried once or twice, as written and, if asides may be
 * dropped, without them; and each reading is tried whole and split into
 * alternatives. Four passes over a short string at worst, which is nothing,
 * and the alternative is a single expression nobody could check by eye.
 *
 * Otherwise this stays strict rather than clever. A reader told they were
 * wrong can try again, reveal the answer, or carry on, so the cost of
 * refusing a near miss is a button press; the cost of accepting a wrong
 * answer is being told they know something they do not.
 */
export function judgeAnswer(
  typed: string,
  back: string,
  separators: string = DEFAULT_ANSWER_SEPARATORS,
): boolean {
  const given = normaliseAnswer(typed);
  if (given === "") return false;

  // The brackets are a choice about what may be left out, not a character to
  // split on, so they come out before the splitting pattern is built. An empty
  // pattern is fine: `[]` matches nothing, so the line simply stays whole.
  const asidesOptional = separators.includes("(");
  const pattern = separatorPattern(separators.replace(/[()]/g, ""));

  // A back with no newline is one line, and putting it through `split` as well
  // would compare the same string twice. The comment above promises four
  // passes at worst, and this is what keeps that true of the common case.
  const lines = back.includes("\n") ? [back, ...back.split("\n")] : [back];

  for (const line of lines) {
    for (const reading of asidesOptional ? [line, withoutAsides(line)] : [line]) {
      // The back exactly as it is written, before any separator is touched.
      // Without this pass a reader who copies the answer character for
      // character is told they are wrong: every other comparison has already
      // turned the separators into spaces, so "and/or" is being measured
      // against "and or", and the two differ by more than a typo once the
      // string is short. The card's own back has to be a right answer.
      const asWritten = normaliseAnswer(reading);
      if (asWritten !== "" && alike(given, asWritten)) return true;

      // The separators become spaces here, so "gladly/willingly" typed out in
      // full matches however the reader punctuated it.
      const whole = normaliseAnswer(reading.replace(pattern, " "));
      if (whole === "") continue;
      if (alike(given, whole)) return true;

      const alternatives = reading
        .split(pattern)
        .map(normaliseAnswer)
        .filter((alternative) => alternative !== "");
      if (alternatives.length < 2) continue;

      // One of them on its own, typo and all.
      if (alternatives.some((one) => alike(given, one))) return true;

      // Or several of them together.
      if (madeOf(given, alternatives)) return true;
    }
  }

  return false;
}
