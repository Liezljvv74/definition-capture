import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Renaming a collection or a source reaches everything filed under it, so the
 * order of the steps is the whole of the correctness: the database rename
 * first, then the Settings list shown with the new name, then the lists read
 * again. A rename that fails must change nothing, or the Settings list would
 * say one name and every word another. A name that is only one of the unsaved
 * defaults has no row to rename, so it is saved as a list change instead. The
 * other lists rename the list and nothing else.
 *
 * Every collaborator is mocked, and each records itself in `calls`, so these
 * assert the sequence rather than the effects of any one step.
 */

const state = vi.hoisted(() => ({
  calls: [] as string[],
  rpcError: null as { message: string } | null,
  lists: {} as Record<string, string[]>,
  stored: {} as Record<string, string[]>,
}));

vi.mock("@/lib/supabaseClient", () => ({
  getSupabase: () => ({
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      state.calls.push(
        `rpc:${name}:${args.tag_context ? args.tag_context + ":" : ""}${args.from_name}->${args.to_name}`,
      );
      return { error: state.rpcError };
    }),
  }),
}));

vi.mock("@/lib/session", () => ({ currentUserId: () => "user-1" }));

vi.mock("@/lib/settings", () => ({
  currentSettings: () => state.lists,
  storedNames: async (list: string) => ({ error: null, names: state.stored[list] ?? [] }),
  noteRenamed: vi.fn((list: string, from: string, to: string) => {
    state.calls.push(`note:${list}:${from}->${to}`);
  }),
  saveSettings: vi.fn((change: Record<string, string[]>) => {
    for (const [key, value] of Object.entries(change)) {
      state.calls.push(`save:${key}:${value.join(",")}`);
    }
  }),
}));

vi.mock("@/lib/storage", () => ({ reload: () => state.calls.push("reload:words") }));
vi.mock("@/lib/phraseStorage", () => ({ reload: () => state.calls.push("reload:phrases") }));
vi.mock("@/lib/rules", () => ({ reload: () => state.calls.push("reload:rules") }));

import { renameCollection, renameInList, renameSource, renameTopic } from "@/lib/renames";

beforeEach(() => {
  state.calls = [];
  state.rpcError = null;
  state.lists = {
    collections: ["Food", "Meal", "Travel"],
    sources: ["Claude", "Google", "Manual"],
    topics: ["Cases", "Word order"],
    verbPersons: ["ich", "du", "er/sie/es"],
    verbTenses: ["Past", "Present"],
    sortSkipWords: ["der", "die"],
  };
  state.stored = {
    collections: ["Food", "Meal", "Travel"],
    sources: ["Claude", "Google", "Manual"],
    topics: ["Cases", "Word order"],
  };
});

describe("renameCollection", () => {
  it("renames in the database, then shows it on the list, then reads the lists again", async () => {
    expect(await renameCollection("Meal", "Dinner")).toBeNull();
    expect(state.calls).toEqual([
      "rpc:rename_tag:collection:Meal->Dinner",
      "note:collections:Meal->Dinner",
      "reload:words",
      "reload:phrases",
    ]);
  });

  it("saves the list instead for a default nobody has stored yet", async () => {
    // An untouched account is shown the defaults without a row behind any of
    // them, so there is nothing for the database to rename.
    state.stored.collections = [];
    expect(await renameCollection("Meal", "Dinner")).toBeNull();
    expect(state.calls).toEqual(["save:collections:Food,Dinner,Travel"]);
  });

  it("changes nothing when the database refuses", async () => {
    // The list must not be saved with a name the words do not carry.
    state.rpcError = { message: "boom" };
    const result = await renameCollection("Meal", "Dinner");
    expect(result).toMatch(/Could not rename/);
    expect(state.calls).toEqual(["rpc:rename_tag:collection:Meal->Dinner"]);
  });

  it("matches the old name however it is cased", async () => {
    await renameCollection("meal", "Dinner");
    expect(state.calls[0]).toBe("rpc:rename_tag:collection:meal->Dinner");
  });

  it("trims the new name, and refuses an empty one without asking the database", async () => {
    await renameCollection("Meal", "  Dinner  ");
    expect(state.calls[0]).toBe("rpc:rename_tag:collection:Meal->Dinner");

    state.calls = [];
    expect(await renameCollection("Meal", "   ")).toMatch(/needs a name/);
    expect(state.calls).toEqual([]);
  });
});

describe("renameSource", () => {
  it("goes through the database in the same order as a collection", async () => {
    expect(await renameSource("Google", "Google Translate")).toBeNull();
    expect(state.calls).toEqual([
      "rpc:rename_item_source:Google->Google Translate",
      "note:sources:Google->Google Translate",
      "reload:words",
      "reload:phrases",
    ]);
  });

  it("changes nothing when the database refuses", async () => {
    state.rpcError = { message: "boom" };
    expect(await renameSource("Google", "Bing")).toMatch(/Could not rename that source/);
    expect(state.calls).toEqual(["rpc:rename_item_source:Google->Bing"]);
  });
});

describe("renameTopic", () => {
  it("renames the grammar tag, shows it, and reads the rules again", async () => {
    expect(await renameTopic("Cases", "Fälle")).toBeNull();
    expect(state.calls).toEqual([
      "rpc:rename_tag:grammar:Cases->Fälle",
      "note:topics:Cases->Fälle",
      "reload:rules",
    ]);
  });

  it("changes nothing when the database refuses", async () => {
    state.rpcError = { message: "boom" };
    expect(await renameTopic("Cases", "Fälle")).toMatch(/Could not rename that topic/);
    expect(state.calls).toEqual(["rpc:rename_tag:grammar:Cases->Fälle"]);
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
