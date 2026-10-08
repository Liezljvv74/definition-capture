"use client";

import { useEffect, useSyncExternalStore } from "react";

import { playParts, RATE_VALUE, resolveLangs, type SpeechPart, type Utterance } from "@/lib/speech";
import { useSettings } from "@/lib/useSettings";

/*
 * One reading at a time for the whole app: `current` is what is being read
 * and which button started it. Every speaker reads it through
 * `useSyncExternalStore`, so starting one turns every other back to a
 * speaker icon.
 */
let current: { key: string; stop: () => void } | null = null;
const listeners = new Set<() => void>();

function setCurrent(next: typeof current) {
  current = next;
  listeners.forEach((listener) => listener());
}

/** A reading starts for `key`; whatever was reading is stopped first. */
export function beginReading(key: string, stop: () => void): void {
  current?.stop();
  setCurrent({ key, stop });
}

/** `key` stops its own reading; another button's is left alone. */
export function stopReading(key: string): void {
  if (current?.key !== key) return;
  current.stop();
  setCurrent(null);
}

/** `key`'s reading came to its end. A newer reading by another button stays. */
export function finishReading(key: string): void {
  if (current?.key === key) setCurrent(null);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const neverChanges = () => () => {};
const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

/**
 * Whether this browser can speak. The server answers no, so its HTML and the
 * first render in the browser agree and no speaker causes a hydration error.
 */
export function useSpeechSupported(): boolean {
  return useSyncExternalStore(neverChanges, canSpeak, () => false);
}

/**
 * Reading aloud for one button, named by `key`. Speaks in the account's
 * studied and native languages at its chosen speed, stops whatever else was
 * reading, and stops when the button leaves the page.
 */
export function useSpeech(key: string) {
  const { settings } = useSettings();
  const playing = useSyncExternalStore(subscribe, () => current?.key === key, () => false);

  useEffect(() => () => stopReading(key), [key]);

  /** `context` is text the parts come from, used to place parts that give no clue of their own. */
  function start(parts: SpeechPart[], onPart?: (part: SpeechPart) => void, context: readonly string[] = []) {
    if (current) stopReading(current.key);
    if (!canSpeak() || parts.length === 0) return;
    const synth = window.speechSynthesis;
    // Text that may be in either language (a rule's prose) is placed now,
    // against the account's two languages.
    const spoken = resolveLangs(parts, settings.language, settings.nativeLanguage, context);
    const stopThis = playParts(synth as unknown as Parameters<typeof playParts>[0], spoken, {
      studied: settings.language,
      native: settings.nativeLanguage,
      rate: RATE_VALUE[settings.speechRate],
      // Read when speech starts, not when the page renders: the list arrives
      // a moment after load, and is empty on Chrome's first call.
      voices: synth.getVoices(),
      make: (text) => new SpeechSynthesisUtterance(text) as unknown as Utterance,
      onPart,
      onEnd: () => finishReading(key),
    });
    beginReading(key, stopThis);
  }

  return { playing, start, stop: () => stopReading(key) };
}
