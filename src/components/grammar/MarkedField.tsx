"use client";

import { useRef, type UIEvent } from "react";

import { HIGHLIGHT_CLASS } from "@/components/grammar/RichText";
import { highlightRuns } from "@/lib/blockText";

/**
 * A text box that shows its highlights, as the owner chose on 28 September:
 * tinted, with the markers in faint grey. A textarea or input cannot colour
 * part of its own text, so a copy of the text is drawn behind it, and the
 * box's own letters are made transparent over the copy; the caret and the
 * selection stay the box's. Both are drawn from one class list so the
 * letters line up, and the copy follows the box when it scrolls.
 *
 * The copy is always in the page, only hidden when there is no highlight, so
 * that one appearing or going while typing changes a class rather than the
 * element, and the caret stays where it was.
 */
export function MarkedField({
  id,
  value,
  onChange,
  className,
  multiline = false,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  className: string;
  multiline?: boolean;
  placeholder?: string;
}) {
  const behind = useRef<HTMLDivElement>(null);
  const runs = highlightRuns(value);
  const marked = runs.some((run) => run.marker);
  const follow = (event: UIEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (!behind.current) return;
    behind.current.scrollTop = event.currentTarget.scrollTop;
    behind.current.scrollLeft = event.currentTarget.scrollLeft;
  };
  const shared = `${className} ${multiline ? "whitespace-pre-wrap break-words" : "whitespace-pre"}`;
  const own = `${shared} relative ${marked ? "bg-transparent! text-transparent! caret-slate-900 dark:caret-slate-100" : ""}`;

  return (
    <div className="relative">
      <div
        ref={behind}
        aria-hidden="true"
        className={`${shared} pointer-events-none absolute inset-0 overflow-hidden border-transparent! ${marked ? "" : "invisible"}`}
      >
        {runs.map((run, index) =>
          run.marker ? (
            <span key={index} className="text-slate-400 dark:text-slate-500">{run.text}</span>
          ) : run.colour ? (
            <mark key={index} className={`rounded-sm text-inherit ${HIGHLIGHT_CLASS[run.colour]}`}>{run.text}</mark>
          ) : (
            <span key={index}>{run.text}</span>
          ),
        )}
        {/* A final line break takes no room in the copy unless something follows it. */}
        {multiline && value.endsWith("\n") ? " " : null}
      </div>
      {multiline ? (
        <textarea id={id} className={own} value={value} placeholder={placeholder} onScroll={follow} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input id={id} className={own} value={value} placeholder={placeholder} onScroll={follow} onChange={(event) => onChange(event.target.value)} />
      )}
    </div>
  );
}
