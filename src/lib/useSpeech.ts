"use client";

import { useEffect, useSyncExternalStore } from "react";

import { playParts, RATE_VALUE, type SpeechPart, type Utterance } from "@/lib/speech";
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

  useEffect(
    () => () => {
      if (current?.key === key) {
        current.stop();
        setCurrent(null);
      }
    },
    [key],
  );

  function stop() {
    if (current?.key !== key) return;
    current.stop();
    setCurrent(null);
  }

  function start(parts: SpeechPart[], onPart?: (part: SpeechPart) => void) {
    current?.stop();
    if (!canSpeak() || parts.length === 0) {
      setCurrent(null);
      return;
    }
    const synth = window.speechSynthesis;
    const stopThis = playParts(synth as unknown as Parameters<typeof playParts>[0], parts, {
      studied: settings.language,
      native: settings.nativeLanguage,
      rate: RATE_VALUE[settings.speechRate],
      // Read when speech starts, not when the page renders: the list arrives
      // a moment after load, and is empty on Chrome's first call.
      voices: synth.getVoices(),
      make: (text) => new SpeechSynthesisUtterance(text) as unknown as Utterance,
      onPart,
      onEnd: () => {
        if (current?.key === key) setCurrent(null);
      },
    });
    setCurrent({ key, stop: stopThis });
  }

  return { playing, start, stop };
}
