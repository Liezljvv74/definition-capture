// Pure on purpose: the pages, the hook and the tests all import this, so it
// touches neither the browser nor the database. See Docs/voice.md.

import { plainText } from "@/lib/blockText";
import type { Rule, VerbRow } from "@/lib/types";

export type SpeechRate = "slow" | "normal" | "fast";

export const SPEECH_RATES: readonly SpeechRate[] = ["slow", "normal", "fast"];

/** The utterance rate for each choice; 1 is the voice's own pace. */
export const RATE_VALUE: Record<SpeechRate, number> = { slow: 0.75, normal: 1, fast: 1.25 };

/** A stored or restored value as a speed, "normal" for anything else. */
export function readSpeechRate(value: unknown): SpeechRate {
  return SPEECH_RATES.find((rate) => rate === value) ?? "normal";
}

/** Which of the reader's two languages a part is in. */
export type SpeechLang = "studied" | "native";

/** One thing to say. `blockId` names the rule block it came from, for the outline. */
export type SpeechPart = { text: string; lang: SpeechLang; blockId?: string };

/**
 * The voice for a language code: an exact match, then the language in any
 * region ("es" finds "es-MX"), else null, which leaves the browser to choose.
 * Some systems write the region with an underscore, so both are read.
 */
export function pickVoice<V extends { lang: string }>(voices: readonly V[], code: string): V | null {
  if (!code) return null;
  const wanted = code.toLowerCase();
  const langOf = (voice: V) => voice.lang.toLowerCase().replace("_", "-");
  return (
    voices.find((voice) => langOf(voice) === wanted) ??
    voices.find((voice) => langOf(voice).startsWith(`${wanted}-`)) ??
    null
  );
}

/**
 * Text cut at sentence ends and line breaks. Chrome stops an utterance after
 * about 15 seconds, so a long block is said a sentence at a time.
 */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** "er/sie/es" said as "er, sie, es": a voice reads a slash as a word. */
export function spokenPerson(person: string): string {
  return person.replace(/\s*\/\s*/g, ", ").trim();
}

/** A word, phrase or sentence in the language being learned. */
export function studiedParts(text: string): SpeechPart[] {
  return sentences(text).map((sentence) => ({ text: sentence, lang: "studied" }));
}

/** One tense down a conjugation table: person and form, empty cells skipped. */
export function tenseParts(rows: readonly VerbRow[], column: number): SpeechPart[] {
  return rows
    .map((row) => ({ person: spokenPerson(row.person), form: (row.conjugations[column] ?? "").trim() }))
    .filter(({ form }) => form !== "")
    .map(({ person, form }) => ({ text: `${person} ${form}`.trim(), lang: "studied" }));
}

/**
 * A rule as it reads on the page: the title and text in the reader's own
 * language; a table row by row, its header cells in the reader's language
 * and the rest in the one being learned; an example's sentence in the
 * language being learned and its translation in the reader's. Text is read
 * as shown (`plainText`), so a link reads as its label.
 */
export function ruleParts(rule: Pick<Rule, "title" | "blocks">): SpeechPart[] {
  const parts: SpeechPart[] = sentences(rule.title).map((text) => ({ text, lang: "native" }));
  for (const block of rule.blocks) {
    const say = (text: string, lang: SpeechLang) =>
      sentences(plainText(text)).forEach((sentence) => parts.push({ text: sentence, lang, blockId: block.id }));
    if (block.kind === "text") say(block.text, "native");
    else if (block.kind === "example") {
      say(block.sentence, "studied");
      say(block.translation, "native");
    } else {
      block.cells.forEach((row, r) =>
        row.forEach((cell, c) => {
          const header = (block.headerRow && r === 0) || (block.headerColumn && c === 0);
          say(cell, header ? "native" : "studied");
        }),
      );
    }
  }
  return parts;
}

/**
 * The parts of an utterance this module sets. A real
 * `SpeechSynthesisUtterance` has them all; the hook casts one to this so the
 * player can be tested with a plain object.
 */
export type Utterance = {
  lang: string;
  voice: unknown;
  rate: number;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};

export type PlayOptions = {
  /** Language codes; "" leaves `lang` unset, so the browser's default voice reads. */
  studied: string;
  native: string;
  rate: number;
  voices: readonly { lang: string }[];
  make: (text: string) => Utterance;
  onPart?: (part: SpeechPart) => void;
  onEnd?: () => void;
};

/**
 * Says the parts one after another and returns a stop. Whatever was being
 * said is cancelled first. Once stopped, nothing more is said and `onEnd` is
 * not called: cancelling makes the browser fire `onend` or `onerror` on the
 * utterance it cut short, and that must not start the next part.
 */
export function playParts(
  synth: { speak(utterance: Utterance): void; cancel(): void },
  parts: readonly SpeechPart[],
  options: PlayOptions,
): () => void {
  let stopped = false;
  let at = 0;
  synth.cancel();

  const next = () => {
    if (stopped) return;
    const part = parts[at];
    at += 1;
    if (!part) {
      stopped = true;
      options.onEnd?.();
      return;
    }
    const utterance = options.make(part.text);
    const code = part.lang === "studied" ? options.studied : options.native;
    if (code) {
      utterance.lang = code;
      const voice = pickVoice(options.voices, code);
      if (voice) utterance.voice = voice;
    }
    utterance.rate = options.rate;
    // A part that fails on its own is skipped; one cut short by a stop is not
    // a failure, and `stopped` already ends the reading. Both handlers are
    // cleared by whichever fires first, since a browser may fire both.
    const advance = () => {
      utterance.onend = null;
      utterance.onerror = null;
      next();
    };
    utterance.onend = advance;
    utterance.onerror = advance;
    options.onPart?.(part);
    synth.speak(utterance);
  };

  next();
  return () => {
    stopped = true;
    synth.cancel();
  };
}
