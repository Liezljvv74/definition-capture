"use client";

import Link from "next/link";
import { useMemo } from "react";

import { KIND_LABEL, linkedFrom } from "@/lib/links";
import { useLinkTargets } from "@/lib/useLinkTargets";

/**
 * The items whose text links to this one. Worked out from text already
 * written, so there is nothing stored to keep in step; nothing is shown when
 * nothing links here.
 */
export function LinkedFrom({ href }: { href: string }) {
  const { targets, linkIndex } = useLinkTargets();
  // `targets` and `linkIndex` are themselves cached (see `useLinkTargets.ts`),
  // so this only redoes the scan over every target's text when one of them
  // actually changed, rather than on every render of a card that happens to
  // sit on a page with this mounted.
  const linkers = useMemo(() => linkedFrom(targets, linkIndex, href), [targets, linkIndex, href]);
  if (linkers.length === 0) return null;
  return (
    <section className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
      <h2 className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">Linked from</h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {linkers.map((t) => (
          <li key={t.href}>
            <Link href={t.href} className="text-sm text-indigo-700 underline underline-offset-2 hover:text-indigo-500 dark:text-indigo-300">
              {t.name}
            </Link>{" "}
            <span className="text-xs text-slate-500 dark:text-slate-400">{KIND_LABEL[t.kind]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
