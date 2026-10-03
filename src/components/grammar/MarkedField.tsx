"use client";

import { useLayoutEffect, useRef, type UIEvent } from "react";

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
  wrap = false,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  className: string;
  multiline?: boolean;
  /**
   * One line of text, shown wrapped across as many rows as it needs, for a
   * table cell. It is a textarea only so that it can wrap: a line break is
   * turned into a space, `data-single-line` has Enter move to the field below
   * as it does from an input (`enterMovesDown.ts`), and the box grows to its
   * text by measuring it, which works where `field-sizing` does not.
   */
  wrap?: boolean;
  placeholder?: string;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = box.current;
    if (!wrap || !element) return;
    const fit = () => {
      element.style.height = "auto";
      // The height includes the border (boxes size by their border edge),
      // and `scrollHeight` does not, so the border is added back.
      element.style.height = `${element.scrollHeight + element.offsetHeight - element.clientHeight}px`;
    };
    fit();
    // Again whenever the column's width changes, as it does when the window
    // is resized, since the box hides what overflows and would cut text off.
    const watch = new ResizeObserver(fit);
    watch.observe(element);
    return () => watch.disconnect();
  }, [wrap, value]);
  const lines = multiline || wrap;
  const behind = useRef<HTMLDivElement>(null);
  const runs = highlightRuns(value);
  const marked = runs.some((run) => run.marker);
  const follow = (event: UIEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    if (!behind.current) return;
    behind.current.scrollTop = event.currentTarget.scrollTop;
    behind.current.scrollLeft = event.currentTarget.scrollLeft;
  };
  // `[scrollbar-gutter:stable]` on the multiline box and its copy: the caller
  // sizes a text block's textarea with `[field-sizing:content]`, which
  // Firefox does not support, so there it keeps the height it was given and
  // gains a scrollbar once its text overflows it, while the copy's
  // `overflow-hidden` never grows one. A scrollbar narrows the content box it
  // sits in, so without a gutter reserved on both, the textarea would wrap
  // its words one column narrower than the copy behind it and the tint would
  // drift off them.
  // A wrapped cell never scrolls, since it grows to its text, so it needs no gutter.
  const shared = `${className} ${wrap ? "whitespace-pre-wrap break-words" : multiline ? "whitespace-pre-wrap break-words [scrollbar-gutter:stable]" : "whitespace-pre"}`;
  // `block`: a textarea or input is inline-block by default and sits on the
  // wrapper's baseline, which leaves the wrapper (and so the absolutely
  // positioned copy behind it) a few pixels taller than the box; `block`
  // makes the wrapper exactly the box's own height. `resize-y` on the
  // textarea keeps a drag narrowing it from giving it a width the copy
  // does not share, which would wrap the two at different points and pull
  // a tint off its words. `transition-none` while marked stops the box's
  // letters fading out over the copy's own instant appearance, which
  // otherwise shows the text doubled for a moment.
  const own = `${shared} relative block ${wrap ? "resize-none overflow-hidden" : multiline ? "resize-y" : ""} ${marked ? "bg-transparent! text-transparent! caret-ink transition-none" : ""}`;

  return (
    <div className="relative">
      <div
        ref={behind}
        aria-hidden="true"
        // `shadow-none!` because `.field`'s own shadow would otherwise be
        // drawn twice, once for the copy and once for the box on top of it.
        // `transition-none` so the copy never fades in behind a box that is
        // still fading its own letters out.
        className={`${shared} pointer-events-none absolute inset-0 overflow-hidden border-transparent! shadow-none! transition-none ${marked ? "" : "invisible"}`}
      >
        {runs.map((run, index) =>
          run.marker ? (
            <span key={index} className="text-ink-soft">{run.text}</span>
          ) : run.colour ? (
            <mark key={index} className={`rounded-sm text-inherit ${HIGHLIGHT_CLASS[run.colour]}`}>{run.text}</mark>
          ) : (
            <span key={index}>{run.text}</span>
          ),
        )}
        {/* A final line break takes no room in the copy unless something follows it. */}
        {lines && value.endsWith("\n") ? " " : null}
      </div>
      {wrap ? (
        <textarea
          ref={box}
          id={id}
          rows={1}
          data-single-line
          // As the one-line boxes these cells used to be, which a browser
          // does not mark up: a table of German forms would otherwise be
          // underlined from end to end.
          spellCheck={false}
          className={own}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value.replace(/\r?\n/g, " "))}
        />
      ) : multiline ? (
        <textarea id={id} className={own} value={value} placeholder={placeholder} onScroll={follow} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input id={id} className={own} value={value} placeholder={placeholder} onScroll={follow} onChange={(event) => onChange(event.target.value)} />
      )}
    </div>
  );
}
