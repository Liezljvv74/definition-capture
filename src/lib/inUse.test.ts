import { describe, expect, it } from "vitest";

import { inUseReason, countUses } from "@/lib/inUse";

/**
 * The Settings bin is switched off for a collection or source still in use,
 * because the database refuses to delete one. If these counted wrong the
 * button would either offer a delete that fails or refuse one that would
 * have worked, and neither says why.
 */
describe("countUses", () => {
  it("counts each item once per name, however the name is spelled", () => {
    const counts = countUses([["Home", "home"], ["Travel", "Home"], ["Tür"]]);
    expect(counts.get("home")).toBe(2);
    expect(counts.get("travel")).toBe(1);
  });

  it("ignores blank names, which is what an item with no source carries", () => {
    expect(countUses([[""], ["  "]]).size).toBe(0);
  });
});

describe("inUseReason", () => {
  const counts = countUses([["Home"], ["Home", "Food"]]);

  it("allows removing a name nothing uses", () => {
    expect(inUseReason(counts, "Travel")).toBeUndefined();
  });

  it("says how many use it, matched regardless of case", () => {
    expect(inUseReason(counts, "HOME")).toMatch(/^2 words and phrases use it/);
    expect(inUseReason(counts, "Food")).toMatch(/^1 word or phrase uses it/);
  });
});
