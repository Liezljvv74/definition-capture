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

/**
 * One thing to say. `blockId` names the rule block it came from, for the
 * outline. "auto" is text that may be in either language, a rule's prose,
 * which `resolveLangs` settles before anything is said.
 */
export type SpeechPart = { text: string; lang: SpeechLang | "auto"; blockId?: string };

/*
 * Telling which of two languages a sentence is in, without a library: the
 * short words every sentence leans on, and the alphabets a language alone
 * uses. A word both languages share ("la" in French and Spanish) counts for
 * both and so decides nothing. Only the presets' languages are known; for
 * any other, the words give no clue and the fallback decides.
 */
const COMMON_WORDS: Record<string, ReadonlySet<string>> = Object.fromEntries(
  Object.entries({
    en: "the a an and of to is are was in it that this with for on as be by not or you your what which",
    fr: "le la les un une des et est sont de du au aux en que qui ne pas pour avec dans sur ce cette il elle on nous vous je tu se",
    de: "der die das und ist sind ein eine nicht mit von zu den dem des auf für ich du er sie wir ihr es im wird",
    es: "el la los las un una y es son de del que en por para con no se lo al yo tú usted está",
    it: "il lo la gli le un una e è sono di del che in per con non si io tu noi voi della",
    pt: "o a os as um uma e é são de do da que em para com não se eu tu você",
    nl: "de het een en is zijn van te dat die niet met op voor ik jij hij zij wij",
  }).map(([code, words]) => [code, new Set(words.split(" "))]),
);

const SCRIPTS: Record<string, RegExp> = {
  ru: /[Ѐ-ӿ]/,
  zh: /[一-鿿]/,
  ja: /[぀-ヿ]/,
  ko: /[가-힯]/,
};

/**
 * Which of the two languages `text` is written in, by its alphabet and then
 * its common words; `fallback` when neither gives a clue.
 */
export function guessLang(text: string, studied: string, native: string, fallback: SpeechLang = "native"): SpeechLang {
  const base = (code: string) => code.toLowerCase().split("-")[0];
  const [s, n] = [base(studied), base(native)];
  if (SCRIPTS[s]?.test(text) && !SCRIPTS[n]?.test(text)) return "studied";
  if (SCRIPTS[n]?.test(text) && !SCRIPTS[s]?.test(text)) return "native";
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  const count = (code: string) => words.filter((word) => COMMON_WORDS[code]?.has(word)).length;
  const [inStudied, inNative] = [count(s), count(n)];
  if (inStudied > inNative) return "studied";
  if (inNative > inStudied) return "native";
  return fallback;
}

/**
 * Settles every "auto" part. The whole of the undecided text is judged first,
 * together with `context` (the rest of the rule a selection was taken from),
 * so a part with no clue of its own, a heading such as "Masculin" or a
 * selected "Quel auxiliaire choisir?", follows the language the rule is
 * written in. A part's own words still decide when they can.
 */
export function resolveLangs(
  parts: readonly SpeechPart[],
  studied: string,
  native: string,
  context: readonly string[] = [],
): SpeechPart[] {
  const undecided = parts.filter((part) => part.lang === "auto").map((part) => part.text);
  const overall = guessLang([...undecided, ...context].join(" "), studied, native);
  return parts.map((part) =>
    part.lang === "auto" ? { ...part, lang: guessLang(part.text, studied, native, overall) } : part,
  );
}

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
 * A rule as it reads on the page. The title, the text and a table's header
 * cells may be written in either language, so they are "auto" and
 * `resolveLangs` decides; the other cells are in the language being learned;
 * an example's sentence is in the language being learned and its translation
 * in the reader's. Text is read as shown (`plainText`), so a link reads as
 * its label.
 */
export function ruleParts(rule: Pick<Rule, "title" | "blocks">): SpeechPart[] {
  const parts: SpeechPart[] = sentences(rule.title).map((text) => ({ text, lang: "auto" }));
  for (const block of rule.blocks) {
    const say = (text: string, lang: SpeechPart["lang"]) =>
      sentences(plainText(text)).forEach((sentence) => parts.push({ text: sentence, lang, blockId: block.id }));
    if (block.kind === "text") say(block.text, "auto");
    else if (block.kind === "example") {
      say(block.sentence, "studied");
      say(block.translation, "native");
    } else {
      block.cells.forEach((row, r) =>
        row.forEach((cell, c) => {
          const header = (block.headerRow && r === 0) || (block.headerColumn && c === 0);
          say(cell, header ? "auto" : "studied");
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
