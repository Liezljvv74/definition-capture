"use client";

import Link from "next/link";
import { useMemo } from "react";

import { parseRef } from "@/lib/parseRef";
import type { Entry, Phrase } from "@/lib/types";

/** Lower-cased name → the page it lives on, so `[[Name]]` can find it. */
export type LinkIndex = Map<string, string>;

/** Terms and phrases share one namespace, so a Ref can point at either list. */
export function buildLinkIndex(entries: Entry[], phrases: Phrase[] = []): LinkIndex {
  const index: LinkIndex = new Map();
  for (const phrase of phrases) {
    index.set(phrase.phrase.toLocaleLowerCase(), `/phrases/${phrase.id}`);
  }
  // Terms win a name clash: they are the more specific thing to link to.
  for (const entry of entries) {
    index.set(entry.term.toLocaleLowerCase(), `/terms/${entry.id}`);
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
            const href = linkIndex.get(token.name.toLocaleLowerCase());
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
