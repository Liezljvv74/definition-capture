import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Renaming a category or a source rewrites what is filed under it, so the
 * order of the steps is the whole of the correctness: the database rename
 * first, then the Settings list, then the lists read again. A rename that
 * fails must change nothing, or the Settings list would say one name and every
 * word another. The other lists rename the list and nothing else.
 *
 * Every collaborator is mocked, and each records itself in `calls`, so these
 * assert the sequence rather than the effects of any one step.
 */

const state = vi.hoisted(() => ({
  calls: [] as string[],
  rpcError: null as { message: string } | null,
  lists: {} as Record<string, string[]>,
}));

vi.mock("@/lib/supabaseClient", () => ({
  getSupabase: () => ({
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      state.calls.push(`rpc:${name}:${args.from_name}->${args.to_name}`);
      return { error: state.rpcError };
    }),
  }),
}));

vi.mock("@/lib/session", () => ({ currentUserId: () => "user-1" }));

vi.mock("@/lib/settings", () => ({
  currentSettings: () => state.lists,
  saveSettings: vi.fn((change: Record<string, string[]>) => {
    for (const [key, value] of Object.entries(change)) {
      state.calls.push(`save:${key}:${value.join(",")}`);
    }
  }),
}));

vi.mock("@/lib/storage", () => ({ reload: () => state.calls.push("reload:words") }));
vi.mock("@/lib/phraseStorage", () => ({ reload: () => state.calls.push("reload:phrases") }));

import { renameCategory, renameInList, renameSource } from "@/lib/renames";

beforeEach(() => {
  state.calls = [];
  state.rpcError = null;
  state.lists = {
    categories: ["Food", "Meal", "Travel"],
    sources: ["Claude", "Google", "Manual"],
    verbPersons: ["ich", "du", "er/sie/es"],
    verbTenses: ["Past", "Present"],
    sortSkipWords: ["der", "die"],
  };
});

describe("renameCategory", () => {
  it("renames in the database, then saves the list, then reads the lists again", async () => {
    expect(await renameCategory("Meal", "Dinner")).toBeNull();
    expect(state.calls).toEqual([
      "rpc:rename_category:Meal->Dinner",
      "save:categories:Food,Dinner,Travel",
      "reload:words",
      "reload:phrases",
    ]);
  });

  it("changes nothing when the database refuses", async () => {
    // The list must not be saved with a name the words do not carry.
    state.rpcError = { message: "boom" };
    const result = await renameCategory("Meal", "Dinner");
    expect(result).toMatch(/Could not rename/);
    expect(state.calls).toEqual(["rpc:rename_category:Meal->Dinner"]);
  });

  it("matches the old name however it is cased", async () => {
    await renameCategory("meal", "Dinner");
    expect(state.calls).toContain("save:categories:Food,Dinner,Travel");
  });

  it("trims the new name, and refuses an empty one without asking the database", async () => {
    await renameCategory("Meal", "  Dinner  ");
    expect(state.calls[0]).toBe("rpc:rename_category:Meal->Dinner");

    state.calls = [];
    expect(await renameCategory("Meal", "   ")).toMatch(/needs a name/);
    expect(state.calls).toEqual([]);
  });
});

describe("renameSource", () => {
  it("goes through the database in the same order as a category", async () => {
    expect(await renameSource("Google", "Google Translate")).toBeNull();
    expect(state.calls).toEqual([
      "rpc:rename_source:Google->Google Translate",
      "save:sources:Claude,Google Translate,Manual",
      "reload:words",
      "reload:phrases",
    ]);
  });

  it("changes nothing when the database refuses", async () => {
    state.rpcError = { message: "boom" };
    expect(await renameSource("Google", "Bing")).toMatch(/Could not rename that source/);
    expect(state.calls).toEqual(["rpc:rename_source:Google->Bing"]);
  });
});

describe("renameInList", () => {
  it("renames on the list alone, keeping the name where it was", async () => {
    // Verb persons keep their order, which is a table's row order, so a
    // rename replaces in place rather than moving the name.
    expect(await renameInList("verbPersons", "du", "Du")).toBeNull();
    expect(state.calls).toEqual(["save:verbPersons:ich,Du,er/sie/es"]);
  });

  it("does not touch the database or reload anything", async () => {
    await renameInList("verbTenses", "Past", "Perfekt");
    await renameInList("sortSkipWords", "die", "das");
    expect(state.calls).toEqual(["save:verbTenses:Perfekt,Present", "save:sortSkipWords:der,das"]);
  });

  it("refuses an empty name", async () => {
    expect(await renameInList("verbTenses", "Past", "  ")).toMatch(/cannot be empty/);
    expect(state.calls).toEqual([]);
  });
});
