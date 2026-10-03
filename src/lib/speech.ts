// Pure on purpose: the pages, the hook and the tests all import this, so it
// touches neither the browser nor the database. See Docs/voice.md.

export type SpeechRate = "slow" | "normal" | "fast";

export const SPEECH_RATES: readonly SpeechRate[] = ["slow", "normal", "fast"];

/** The utterance rate for each choice; 1 is the voice's own pace. */
export const RATE_VALUE: Record<SpeechRate, number> = { slow: 0.75, normal: 1, fast: 1.25 };

/** A stored or restored value as a speed, "normal" for anything else. */
export function readSpeechRate(value: unknown): SpeechRate {
  return SPEECH_RATES.find((rate) => rate === value) ?? "normal";
}
