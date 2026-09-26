import { describe, expect, it } from "vitest";

import { cachedLinkTargets } from "@/lib/useLinkTargets";
import type { Entry, Phrase, Rule, VerbTable } from "@/lib/types";

/**
 * Important 3 of the final review: every caller on a page with the same four
 * lists should share one computed result rather than each doing the work
 * again, which is what let a page full of closed cards rebuild the whole
 * link index once per card.
 */
describe("cachedLinkTargets", () => {
  const entries: Entry[] = [];
  const phrases: Phrase[] = [];
  const tables: VerbTable[] = [];
  const rules: Rule[] = [];

  it("returns the identical object for the same four arrays", () => {
    const first = cachedLinkTargets(entries, phrases, tables, rules);
    const second = cachedLinkTargets(entries, phrases, tables, rules);
    expect(second).toBe(first);
  });

  it("recomputes when any one of the four arrays is a new reference", () => {
    const first = cachedLinkTargets(entries, phrases, tables, rules);
    const second = cachedLinkTargets(entries, phrases, [...tables], rules);
    expect(second).not.toBe(first);
  });
});
