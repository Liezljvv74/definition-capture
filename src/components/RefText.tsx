"use client";

import Link from "next/link";
import { useMemo } from "react";

import { foldName } from "@/lib/foldName";
import type { LinkIndex } from "@/lib/links";
import { parseRef } from "@/lib/parseRef";

const linkClass =
  "text-link underline underline-offset-2 hover:text-ink";

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

          case "word": {
            const href = linkIndex.get(foldName(token.name));
            if (!href) {
              return (
                <span
                  key={index}
                  title="Nothing with this name is saved yet"
                  className="text-ink-soft underline decoration-dotted underline-offset-2"
                >
                  {token.label || token.name}
                </span>
              );
            }
            return (
              <Link key={index} href={href} className={linkClass}>
                {token.label || token.name}
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
