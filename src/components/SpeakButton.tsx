"use client";

import { useSpeech, useSpeechSupported } from "@/lib/useSpeech";
import type { SpeechPart } from "@/lib/speech";

/**
 * A speaker that reads `parts` aloud, and a stop while it does. The same size
 * as the row's pencil, so a list row keeps its one ruled line. `parts` is a
 * function so nothing is worked out until it is pressed. Not shown in a
 * browser that cannot speak.
 */
export function SpeakButton({
  speechKey,
  label,
  parts,
  className = "",
}: {
  speechKey: string;
  label: string;
  parts: () => SpeechPart[];
  className?: string;
}) {
  const supported = useSpeechSupported();
  const { playing, start, stop } = useSpeech(speechKey);
  if (!supported) return null;

  return (
    <button
      type="button"
      aria-pressed={playing}
      aria-label={playing ? "Stop reading" : `Read aloud: ${label}`}
      title={playing ? "Stop reading" : "Read aloud"}
      onClick={() => (playing ? stop() : start(parts()))}
      className={`inline-flex cursor-pointer items-center justify-center rounded-md p-1.5 transition hover:bg-tile-sky hover:text-link ${
        playing ? "text-link" : "text-ink-soft"
      } ${className}`}
    >
      {playing ? <StopIcon /> : <SpeakerIcon />}
    </button>
  );
}

export function SpeakerIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      <path d="M2.5 6h2.5l3.5-3v10l-3.5-3H2.5z" />
      <path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.5a6 6 0 0 1 0 9" />
    </svg>
  );
}

export function StopIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className={`shrink-0 ${className}`}>
      <rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor" />
    </svg>
  );
}
