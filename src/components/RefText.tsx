"use client";

import Link from "next/link";
import { useMemo } from "react";

import { parseRef } from "@/lib/parseRef";
import type { Entry } from "@/lib/types";

/** Lower-cased term name → entry id, so `[[Term]]` can find its page. */
export type TermIndex = Map<string, string>;

export function buildTermIndex(entries: Entry[]): TermIndex {
  return new Map(entries.map((entry) => [entry.term.toLocaleLowerCase(), entry.id]));
}

const linkClass = "text-indigo-700 underline underline-offset-2 hover:text-indigo-500 dark:text-indigo-300 dark:hover:text-indigo-200";

/**
 * Renders a Ref value: ordinary words as text, recognised references as links.
 * A `[[Term]]` that matches nothing is shown plainly rather than as a dead link.
 */
export function RefText({ value, termIndex }: { value: string; termIndex: TermIndex }) {
  const tokens = useMemo(() => parseRef(value), [value]);

  return (
    <>
      {tokens.map((token, index) => {
        switch (token.kind) {
          case "text":
            return <span key={index}>{token.value}</span>;

          case "term": {
            const id = termIndex.get(token.name.toLocaleLowerCase());
            if (!id) {
              return (
                <span
                  key={index}
                  title="No term with this name in your glossary yet"
                  className="text-slate-500 underline decoration-dotted underline-offset-2 dark:text-slate-400"
                >
                  {token.name}
                </span>
              );
            }
            return (
              <Link key={index} href={`/terms/${id}`} className={linkClass}>
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
