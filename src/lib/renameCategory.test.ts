import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Renaming a category rewrites what is filed under it, so the order of the
 * steps is the whole of the correctness: the database rename first, then the
 * Settings list, then the lists read again. A rename that fails must change
 * nothing, or the Settings list would say one name and every word another.
 *
 * Every collaborator is mocked, and each records itself in `calls`, so these
 * assert the sequence rather than the effects of any one step.
 */

const state = vi.hoisted(() => ({
  calls: [] as string[],
  rpcError: null as { message: string } | null,
  categories: ["Food", "Meal", "Travel"],
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
  currentSettings: () => ({ categories: state.categories }),
  saveSettings: vi.fn((change: { categories: string[] }) => {
    state.calls.push(`save:${change.categories.join(",")}`);
  }),
}));

vi.mock("@/lib/storage", () => ({ reload: () => state.calls.push("reload:words") }));
vi.mock("@/lib/phraseStorage", () => ({ reload: () => state.calls.push("reload:phrases") }));

import { renameCategory } from "@/lib/renameCategory";

beforeEach(() => {
  state.calls = [];
  state.rpcError = null;
  state.categories = ["Food", "Meal", "Travel"];
});

describe("renameCategory", () => {
  it("renames in the database, then saves the list, then reads the lists again", async () => {
    expect(await renameCategory("Meal", "Dinner")).toBeNull();
    expect(state.calls).toEqual([
      "rpc:rename_category:Meal->Dinner",
      "save:Food,Dinner,Travel",
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
    expect(state.calls).toContain("save:Food,Dinner,Travel");
  });

  it("trims the new name, and refuses an empty one without asking the database", async () => {
    await renameCategory("Meal", "  Dinner  ");
    expect(state.calls[0]).toBe("rpc:rename_category:Meal->Dinner");

    state.calls = [];
    expect(await renameCategory("Meal", "   ")).toMatch(/needs a name/);
    expect(state.calls).toEqual([]);
  });
});
