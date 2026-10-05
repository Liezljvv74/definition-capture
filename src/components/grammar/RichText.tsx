"use client";

import Link from "next/link";
import { useMemo } from "react";

import { parseInline, parseTextBlock, shownText, type HighlightColour, type InlineMode, type InlineToken, type TextLine } from "@/lib/blockText";
import { foldName } from "@/lib/foldName";
import type { LinkIndex } from "@/lib/links";

const linkClass =
  "text-link underline underline-offset-2 hover:opacity-80";

/**
 * Light enough to read dark text through in both themes. Blue rather than
 * the design's pink: red, rose and pink are kept for warnings. Purple
 * is the owner's fourth.
 */
export const HIGHLIGHT_CLASS: Record<HighlightColour, string> = {
  yellow: "bg-yellow-200 dark:bg-yellow-400/35",
  green: "bg-green-200 dark:bg-green-400/30",
  blue: "bg-sky-200 dark:bg-sky-400/30",
  purple: "bg-purple-200 dark:bg-purple-400/30",
};

/**
 * Every element that shows words carries `data-at`, where those words start
 * in the stored text, and holds exactly one text node. The selection toolbar
 * reads it to map a selection back onto the text (`readSelection.ts`).
 */
function Inline({ tokens, linkIndex }: { tokens: InlineToken[]; linkIndex: LinkIndex }) {
  return (
    <>
      {tokens.map((token, index) => {
        switch (token.kind) {
          case "highlight":
            return (
              <mark key={index} className={`rounded-sm text-inherit ${HIGHLIGHT_CLASS[token.colour]}`}>
                <Inline tokens={token.tokens} linkIndex={linkIndex} />
              </mark>
            );
          case "text":
            return <span key={index} data-at={token.at}>{token.value}</span>;
          case "bold":
            return <strong key={index} data-at={token.at}>{token.value}</strong>;
          case "italic":
            return <em key={index} data-at={token.at}>{token.value}</em>;
          case "gap":
            // Underlined and without braces: the braces are for the author
            // and for practice, not the reader.
            return (
              <span key={index} data-at={token.at} className="font-semibold underline decoration-emerald-500 underline-offset-4">
                {token.value}
              </span>
            );
          case "link": {
            const href = linkIndex.get(foldName(token.name));
            const words = shownText(token);
            // Unresolved names read as dotted text, exactly as in a Ref, so
            // one look says the same thing everywhere.
            const shown = !href ? (
              <span
                data-at={token.at}
                data-link=""
                title="Nothing with this name is saved yet"
                className="text-ink-soft underline decoration-dotted underline-offset-2"
              >
                {words}
              </span>
            ) : (
              <Link href={href} data-at={token.at} data-link="" className={linkClass}>
                {words}
              </Link>
            );
            // `data-at` stays on the element holding the words, inside the bold.
            return token.bold ? <strong key={index}>{shown}</strong> : <span key={index} className="contents">{shown}</span>;
          }
        }
      })}
    </>
  );
}

/** One line's worth of markup, for a table cell or an example. */
export function InlineText({ text, linkIndex, mode = "rich" }: { text: string; linkIndex: LinkIndex; mode?: InlineMode }) {
  const tokens = useMemo(() => parseInline(text, mode), [text, mode]);
  return <Inline tokens={tokens} linkIndex={linkIndex} />;
}

/** A text block: paragraphs, with runs of bullets grouped into one list. */
export function RichText({ text, linkIndex }: { text: string; linkIndex: LinkIndex }) {
  const lines = useMemo(() => parseTextBlock(text), [text]);
  const groups = useMemo(() => groupBullets(lines), [lines]);

  return (
    <div data-field="text" className="space-y-2 text-ink">
      {groups.map((group, index) =>
        group.kind === "list" ? (
          <ul key={index} className="list-disc space-y-1 pl-5">
            {group.lines.map((line, at) => (
              <li key={at}>
                <Inline tokens={line.tokens} linkIndex={linkIndex} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={index}>
            <Inline tokens={group.line.tokens} linkIndex={linkIndex} />
          </p>
        ),
      )}
    </div>
  );
}

type Group = { kind: "paragraph"; line: TextLine } | { kind: "list"; lines: TextLine[] };

/** Consecutive bullets become one list; each paragraph stands alone. */
function groupBullets(lines: TextLine[]): Group[] {
  const groups: Group[] = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (line.kind === "bullet") {
      if (last && last.kind === "list") last.lines.push(line);
      else groups.push({ kind: "list", lines: [line] });
    } else {
      groups.push({ kind: "paragraph", line });
    }
  }
  return groups;
}
