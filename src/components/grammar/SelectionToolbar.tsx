"use client";

import type { MouseEvent } from "react";

import { HIGHLIGHT_CLASS } from "@/components/grammar/RichText";
import { HIGHLIGHT_COLOURS, type HighlightColour } from "@/lib/blockText";

/**
 * The buttons below a selection in the reading view. Each is offered only
 * when it can act on this selection: the caller works that out and passes
 * null for the rest. A press must not take the selection away before the
 * click lands, so every button keeps the mouse down from moving focus.
 */
export function SelectionToolbar({
  top,
  left,
  onHighlight,
  onRemove,
  onLink,
  onNewRule,
  onUnlink,
}: {
  top: number;
  left: number;
  onHighlight: ((colour: HighlightColour) => void) | null;
  onRemove: (() => void) | null;
  onLink: (() => void) | null;
  onNewRule: (() => void) | null;
  onUnlink: (() => void) | null;
}) {
  const keep = (event: MouseEvent) => event.preventDefault();
  const button =
    "cursor-pointer rounded px-2 py-1 text-xs font-medium text-ink hover:bg-tile-sky";
  return (
    <div
      role="toolbar"
      aria-label="Selection"
      style={{ top, left }}
      className="absolute z-20 flex max-w-full flex-wrap items-center gap-1 rounded-lg border-2 border-ink bg-card p-1 shadow-md"
    >
      {onHighlight &&
        HIGHLIGHT_COLOURS.map((colour) => (
          <button
            key={colour}
            type="button"
            onMouseDown={keep}
            onClick={() => onHighlight(colour)}
            aria-label={`Highlight ${colour}`}
            title={`Highlight ${colour}`}
            className={`size-6 cursor-pointer rounded-full border border-ink-soft ${HIGHLIGHT_CLASS[colour]}`}
          />
        ))}
      {(
        [
          [onRemove, "Remove highlight"],
          [onUnlink, "Remove link"],
          [onLink, "Link to…"],
          [onNewRule, "New rule from this"],
        ] as const
      ).map(
        ([onClick, label]) =>
          onClick && (
            <button key={label} type="button" onMouseDown={keep} onClick={onClick} className={button}>
              {label}
            </button>
          ),
      )}
    </div>
  );
}
