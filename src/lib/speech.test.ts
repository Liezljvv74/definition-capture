import { describe, expect, it } from "vitest";

import {
  pickVoice, playParts, readSpeechRate, ruleParts, sentences, spokenPerson, studiedParts, tenseParts,
  type Utterance,
} from "@/lib/speech";
import type { Block, VerbRow } from "@/lib/types";

const voices = [
  { lang: "en-GB", name: "English" },
  { lang: "es-MX", name: "Mexican" },
  { lang: "es-ES", name: "Spanish" },
  { lang: "de_DE", name: "German" },
];

describe("pickVoice", () => {
  it("prefers an exact match, then the language with any region", () => {
    expect(pickVoice(voices, "es-ES")?.name).toBe("Spanish");
    expect(pickVoice(voices, "es")?.name).toBe("Mexican");
    expect(pickVoice(voices, "de")?.name).toBe("German");
  });

  it("finds nothing without a code or a match, leaving the browser's default", () => {
    expect(pickVoice(voices, "")).toBeNull();
    expect(pickVoice(voices, "ja")).toBeNull();
    expect(pickVoice([], "es")).toBeNull();
  });
});

describe("text into parts", () => {
  it("splits at sentence ends and lines, dropping blanks", () => {
    expect(sentences("Hola. ¿Qué tal?\n\nBien!")).toEqual(["Hola.", "¿Qué tal?", "Bien!"]);
    expect(sentences("   ")).toEqual([]);
  });

  it("reads a person's slashes as pauses", () => {
    expect(spokenPerson("er/sie/es")).toBe("er, sie, es");
    expect(spokenPerson("ich")).toBe("ich");
  });

  it("reads studied text in the studied language", () => {
    expect(studiedParts("la mariposa")).toEqual([{ text: "la mariposa", lang: "studied" }]);
  });

  it("reads a tense down the table, person and form, skipping empty cells", () => {
    const rows: VerbRow[] = [
      { person: "ich", conjugations: ["gehe", "bin gegangen"], notes: "" },
      { person: "du", conjugations: ["", "bist gegangen"], notes: "" },
      { person: "er/sie/es", conjugations: ["geht"], notes: "" },
    ];
    expect(tenseParts(rows, 0)).toEqual([
      { text: "ich gehe", lang: "studied" },
      { text: "er, sie, es geht", lang: "studied" },
    ]);
    expect(tenseParts(rows, 1).map((p) => p.text)).toEqual(["ich bin gegangen", "du bist gegangen"]);
  });

  it("reads a rule in parts, each in its language, as shown", () => {
    const blocks: Block[] = [
      { kind: "text", id: "t", text: "The **dative** marks the receiver. See [[Akkusativ|the accusative]]." },
      { kind: "table", id: "g", headerRow: true, headerColumn: true, cells: [["", "Masc"], ["Dat", "dem"]] },
      { kind: "example", id: "e", sentence: "Ich gebe {dem} Mann das Buch.", translation: "I give the man the book." },
    ];
    expect(ruleParts({ title: "Dativ", blocks })).toEqual([
      { text: "Dativ", lang: "native" },
      { text: "The dative marks the receiver.", lang: "native", blockId: "t" },
      { text: "See the accusative.", lang: "native", blockId: "t" },
      { text: "Masc", lang: "native", blockId: "g" },
      { text: "Dat", lang: "native", blockId: "g" },
      { text: "dem", lang: "studied", blockId: "g" },
      { text: "Ich gebe dem Mann das Buch.", lang: "studied", blockId: "e" },
      { text: "I give the man the book.", lang: "native", blockId: "e" },
    ]);
  });
});

/** A speechSynthesis stand-in that records what it was asked to say. */
function fakeSynth() {
  const spoken: Utterance[] = [];
  let cancels = 0;
  return {
    spoken,
    cancels: () => cancels,
    synth: { speak: (u: Utterance) => void spoken.push(u), cancel: () => void (cancels += 1) },
  };
}

const make = (text: string): Utterance & { text: string } =>
  ({ text, lang: "", voice: null, rate: 1, onend: null, onerror: null });

describe("playParts", () => {
  const parts = [
    { text: "uno", lang: "studied" as const },
    { text: "one", lang: "native" as const },
  ];

  it("plays parts in order, each in its language and voice, at the rate", () => {
    const { synth, spoken, cancels } = fakeSynth();
    let ended = false;
    playParts(synth, parts, { studied: "es", native: "en", rate: 0.75, voices, make, onEnd: () => (ended = true) });
    expect(cancels()).toBe(1);
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toMatchObject({ text: "uno", lang: "es", rate: 0.75 });
    expect((spoken[0].voice as { name: string }).name).toBe("Mexican");
    spoken[0].onend?.();
    expect(spoken[1]).toMatchObject({ text: "one", lang: "en" });
    spoken[1].onend?.();
    expect(ended).toBe(true);
  });

  it("speaks with the language and no voice when none match", () => {
    const { synth, spoken } = fakeSynth();
    playParts(synth, parts, { studied: "es", native: "en", rate: 1, voices: [], make });
    expect(spoken[0]).toMatchObject({ lang: "es", voice: null });
  });

  it("leaves lang empty without a code", () => {
    const { synth, spoken } = fakeSynth();
    playParts(synth, parts, { studied: "", native: "", rate: 1, voices, make });
    expect(spoken[0]).toMatchObject({ lang: "", voice: null });
  });

  it("a stopped reading does not continue", () => {
    const { synth, spoken, cancels } = fakeSynth();
    let ended = false;
    const stop = playParts(synth, parts, { studied: "es", native: "en", rate: 1, voices, make, onEnd: () => (ended = true) });
    stop();
    expect(cancels()).toBe(2);
    spoken[0].onerror?.({ error: "interrupted" });
    spoken[0].onend?.();
    expect(spoken).toHaveLength(1);
    expect(ended).toBe(false);
  });

  it("carries on past a part that fails for another reason", () => {
    const { synth, spoken } = fakeSynth();
    playParts(synth, parts, { studied: "es", native: "en", rate: 1, voices, make });
    spoken[0].onerror?.({ error: "synthesis-failed" });
    expect(spoken[1]).toMatchObject({ text: "one" });
  });

  it("reports each part as it starts", () => {
    const { synth, spoken } = fakeSynth();
    const seen: string[] = [];
    playParts(synth, parts, { studied: "es", native: "en", rate: 1, voices, make, onPart: (p) => seen.push(p.text) });
    spoken[0].onend?.();
    expect(seen).toEqual(["uno", "one"]);
  });
});

describe("readSpeechRate", () => {
  it("keeps a known speed and defaults anything else to normal", () => {
    expect(readSpeechRate("fast")).toBe("fast");
    expect(readSpeechRate(undefined)).toBe("normal");
  });
});
