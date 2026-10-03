"use client";

import { useEffect, useState } from "react";

import { reducedMotion } from "@/components/notebook/doodles";
import { SpeakerIcon, StopIcon } from "@/components/SpeakButton";
import { ruleParts, sentences, type SpeechPart } from "@/lib/speech";
import type { Rule } from "@/lib/types";
import { useSpeech, useSpeechSupported } from "@/lib/useSpeech";

/**
 * The rule page's floating speaker. Reads the whole rule, each part in its
 * own language, or only the selected text when the selection starts inside
 * the rule. The part being read is outlined and kept in view.
 */
export function RuleReader({ rule }: { rule: Rule }) {
  const supported = useSpeechSupported();
  const { playing, start, stop } = useSpeech(`rule:${rule.id}`);
  const [active, setActive] = useState<string | null>(null);

  // The outline is an attribute on the block's own element, set while it is
  // read and taken off when the reading moves on or stops.
  useEffect(() => {
    if (!playing || !active) return;
    const element = document.querySelector(`[data-speak-block="${CSS.escape(active)}"]`);
    if (!element) return;
    element.setAttribute("data-reading", "");
    element.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
    return () => element.removeAttribute("data-reading");
  }, [playing, active]);

  if (!supported) return null;

  function read() {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";
    const node = selection?.anchorNode ?? null;
    const from = node instanceof Element ? node : node?.parentElement;
    const marked = from?.closest("[data-speak-lang]");
    if (text && marked) {
      // A selection in the rule's own text is judged by its words, like the
      // rule itself; one in an example sentence or a table cell is in the
      // language being learned, and one in a translation in the reader's.
      const where = marked.getAttribute("data-speak-lang");
      const lang: SpeechPart["lang"] = where === "auto" ? "auto" : where === "native" ? "native" : "studied";
      setActive(null);
      start(sentences(text).map((sentence) => ({ text: sentence, lang })));
      return;
    }
    start(ruleParts(rule), (part) => setActive(part.blockId ?? null));
  }

  return (
    <button
      type="button"
      aria-pressed={playing}
      aria-label={playing ? "Stop reading" : "Read the rule aloud"}
      title={playing ? "Stop reading" : "Read aloud (or select some text first)"}
      // Pressing a button can clear a selection in some browsers; keeping it
      // is what lets "select, then press" read only the selection.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => (playing ? stop() : read())}
      className="fixed right-4 bottom-44 z-20 inline-flex size-12 cursor-pointer items-center justify-center rounded-full border-2 border-ink bg-card text-ink shadow-[3px_4px_0_var(--color-shadow)] transition hover:text-link"
    >
      {playing ? <StopIcon className="size-5" /> : <SpeakerIcon className="size-6" />}
    </button>
  );
}
