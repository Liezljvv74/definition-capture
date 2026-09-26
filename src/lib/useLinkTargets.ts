"use client";

import { buildLinkIndex, linkTargets, type LinkIndex, type LinkTarget } from "@/lib/links";
import { usePhrases } from "@/lib/usePhrases";
import { useRules } from "@/lib/useRules";
import { useVerbTables } from "@/lib/useVerbTables";
import { useWords } from "@/lib/useWords";
import type { Entry, Phrase, Rule, VerbTable } from "@/lib/types";

/** What `useLinkTargets` hands every caller. */
type LinkTargets = { targets: LinkTarget[]; linkIndex: LinkIndex };

/**
 * The last four lists this was built from, and what came of them. Kept at
 * module scope, not per component, since every caller on a page (a card, its
 * `RefField`, its `LinkedFrom`) reads the same four lists at the same time
 * and has no reason to end up with four separate copies of the same work.
 */
let lastEntries: readonly Entry[] | null = null;
let lastPhrases: readonly Phrase[] | null = null;
let lastTables: readonly VerbTable[] | null = null;
let lastRules: readonly Rule[] | null = null;
let cached: LinkTargets | null = null;

/**
 * `linkTargets` and `buildLinkIndex`, recomputed only when one of the four
 * lists is actually a new array. The four stores hand back the same array
 * reference until something in that list changes, so comparing by identity
 * is enough: a page with a dozen cards open and closed, none of them editing
 * anything, calls this a dozen times a render and does the work once.
 *
 * A pure function rather than a hook, so it can be tested without React: see
 * `useLinkTargets.test.ts`.
 */
export function cachedLinkTargets(
  entries: readonly Entry[],
  phrases: readonly Phrase[],
  tables: readonly VerbTable[],
  rules: readonly Rule[],
): LinkTargets {
  if (
    cached &&
    entries === lastEntries &&
    phrases === lastPhrases &&
    tables === lastTables &&
    rules === lastRules
  ) {
    return cached;
  }

  const targets = linkTargets(entries, phrases, tables, rules);
  cached = { targets, linkIndex: buildLinkIndex(targets) };
  lastEntries = entries;
  lastPhrases = phrases;
  lastTables = tables;
  lastRules = rules;
  return cached;
}

/**
 * All four lists as link targets, and the index a `[[Name]]` is looked up in.
 * Any page that renders links reads all four, since a link may point at any
 * of them; each list is fetched once per session and shared from there, the
 * word list included, so reading all four here is not the wall of work it
 * would be if every caller fetched its own copy.
 */
export function useLinkTargets(): LinkTargets {
  const { entries } = useWords();
  const { phrases } = usePhrases();
  const { tables } = useVerbTables();
  const { rules } = useRules();
  return cachedLinkTargets(entries, phrases, tables, rules);
}
