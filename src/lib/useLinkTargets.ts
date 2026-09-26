"use client";

import { useMemo } from "react";

import { buildLinkIndex, linkTargets } from "@/lib/links";
import { usePhrases } from "@/lib/usePhrases";
import { useRules } from "@/lib/useRules";
import { useVerbTables } from "@/lib/useVerbTables";
import { useWords } from "@/lib/useWords";

/**
 * All four lists as link targets, and the index a `[[Name]]` is looked up in.
 * Any page that renders links reads all four, since a link may point at any
 * of them; each list is small and fetched once per session.
 */
export function useLinkTargets() {
  const { entries } = useWords();
  const { phrases } = usePhrases();
  const { tables } = useVerbTables();
  const { rules } = useRules();
  return useMemo(() => {
    const targets = linkTargets(entries, phrases, tables, rules);
    return { targets, linkIndex: buildLinkIndex(targets) };
  }, [entries, phrases, tables, rules]);
}
