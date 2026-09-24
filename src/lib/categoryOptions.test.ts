import { describe, expect, it } from "vitest";

import { categoryOptions as withOrder } from "@/lib/categoryOptions";
import { sortingFor } from "@/lib/sortName";

/**
 * The two list pages had drifted on what their category filter offers, and
 * this is the rule that won. It is worth pinning rather than re-deriving,
 * because the difference is invisible until an account is fresh: the losing
 * rule offered all eight default categories and every one of them led to the
 * no-matches screen.
 */
const filed = (...categories: string[]) => ({ categories });

/** The neutral order; which language sorts the options is `sortName`'s concern. */
const categoryOptions = (items: { categories: string[] }[], selected: string) =>
  withOrder(items, selected, sortingFor("", []).compareText);

describe("categoryOptions", () => {
  it("offers only groups something is actually filed under", () => {
    expect(categoryOptions([filed("Food"), filed("Travel"), filed()], "")).toEqual([
      "Food",
      "Travel",
    ]);
  });

  it("offers nothing at all when nothing is filed, so the control can hide", () => {
    expect(categoryOptions([filed(), filed()], "")).toEqual([]);
    expect(categoryOptions([], "")).toEqual([]);
  });

  it("keeps the name being filtered by after its last row loses it", () => {
    // Otherwise the dropdown goes blank while the filter is still applied and
    // the list is still explaining why it is empty.
    expect(categoryOptions([filed("Food")], "Travel")).toEqual(["Food", "Travel"]);
  });

  it("folds a name once and shows it as it was first written", () => {
    expect(categoryOptions([filed("Food"), filed("food"), filed("FOOD")], "")).toEqual([
      "Food",
    ]);
  });

  it("matches the selected name by the same folding, not by exact spelling", () => {
    // `Food` is already there, so selecting `food` must not list it twice.
    expect(categoryOptions([filed("Food")], "food")).toEqual(["Food"]);
  });

  it("sorts them, so the dropdown does not reorder as rows are added", () => {
    expect(categoryOptions([filed("Travel"), filed("Food"), filed("Home")], "")).toEqual([
      "Food",
      "Home",
      "Travel",
    ]);
  });

  it("counts every group on an item that carries several", () => {
    expect(categoryOptions([filed("Food", "Travel")], "")).toEqual(["Food", "Travel"]);
  });
});
