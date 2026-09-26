"use client";

import Link from "next/link";
import { useMemo } from "react";

import type { LinkIndex } from "@/components/RefText";
import { parseInline, parseTextBlock, type InlineToken, type TextLine } from "@/lib/blockText";
import { foldName } from "@/lib/foldName";

const linkClass =
  "text-indigo-700 underline underline-offset-2 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200";

function Inline({ tokens, linkIndex }: { tokens: InlineToken[]; linkIndex: LinkIndex }) {
  return (
    <>
      {tokens.map((token, index) => {
        switch (token.kind) {
          case "text":
            return <span key={index}>{token.value}</span>;
          case "bold":
            return <strong key={index}>{token.value}</strong>;
          case "italic":
            return <em key={index}>{token.value}</em>;
          case "link": {
            const href = linkIndex.get(foldName(token.name));
            // Unresolved names read as dotted text, exactly as in a Ref, so
            // one look says the same thing everywhere.
            if (!href) {
              return (
                <span
                  key={index}
                  title="Nothing with this name is saved yet"
                  className="text-slate-500 underline decoration-dotted underline-offset-2 dark:text-slate-400"
                >
                  {token.name}
                </span>
              );
            }
            return (
              <Link key={index} href={href} className={linkClass}>
                {token.name}
              </Link>
            );
          }
        }
      })}
    </>
  );
}

/** One line's worth of markup, for a table cell or an example. */
export function InlineText({ text, linkIndex }: { text: string; linkIndex: LinkIndex }) {
  const tokens = useMemo(() => parseInline(text), [text]);
  return <Inline tokens={tokens} linkIndex={linkIndex} />;
}

/** A text block: paragraphs, with runs of bullets grouped into one list. */
export function RichText({ text, linkIndex }: { text: string; linkIndex: LinkIndex }) {
  const lines = useMemo(() => parseTextBlock(text), [text]);
  const groups = useMemo(() => groupBullets(lines), [lines]);

  return (
    <div className="space-y-2 text-slate-800 dark:text-slate-200">
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
