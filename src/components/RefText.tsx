"use client";

import Link from "next/link";
import { useMemo } from "react";

import { foldName } from "@/lib/foldName";
import { parseRef } from "@/lib/parseRef";
import type { Entry, Phrase } from "@/lib/types";

/** Folded name (see `foldName`) → the page it lives on, so `[[Name]]` finds it. */
export type LinkIndex = Map<string, string>;

/**
 * Both lists share one namespace, so a `[[Name]]` can point at either of them.
 *
 * Built lowest precedence first, because a later `set` wins a name clash:
 * phrases, then terms. Terms stay on top, being the most specific thing
 * to link to, so a list added later must not quietly re-point existing links.
 */
export function buildLinkIndex(entries: Entry[], phrases: Phrase[] = []): LinkIndex {
  const index: LinkIndex = new Map();
  for (const phrase of phrases) {
    index.set(foldName(phrase.phrase), `/phrase?id=${phrase.id}`);
  }
  for (const entry of entries) {
    index.set(foldName(entry.term), `/term?id=${entry.id}`);
  }
  return index;
}

const linkClass =
  "text-indigo-700 underline underline-offset-2 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200";

/**
 * Renders a Ref value: ordinary words as text, recognised references as links.
 * A `[[Name]]` that matches nothing is shown plainly rather than as a dead link.
 */
export function RefText({ value, linkIndex }: { value: string; linkIndex: LinkIndex }) {
  const tokens = useMemo(() => parseRef(value), [value]);

  return (
    <>
      {tokens.map((token, index) => {
        switch (token.kind) {
          case "text":
            return <span key={index}>{token.value}</span>;

          case "term": {
            const href = linkIndex.get(foldName(token.name));
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

          case "internal":
            return (
              <Link key={index} href={token.href} className={linkClass}>
                {token.label}
              </Link>
            );

          case "anchor":
            return (
              <a key={index} href={token.href} className={linkClass}>
                {token.label}
              </a>
            );

          case "url":
            return (
              <a
                key={index}
                href={token.href}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
                title={token.href}
              >
                {token.label}
              </a>
            );
        }
      })}
    </>
  );
}
