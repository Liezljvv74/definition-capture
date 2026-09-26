import { describe, expect, it, vi } from "vitest";

import { createRemoteStore } from "@/lib/remoteStore";

// No session and no Supabase under test, so writes do not leave the cache.
// That is enough for what these assert: the shared helpers the four stores
// now hand out, and the shape of the object they are handed out from.
vi.mock("@/lib/supabaseClient", () => ({ getSupabase: () => null }));
vi.mock("@/lib/session", () => ({
  currentUserId: () => "user-1",
  subscribe: () => () => {},
}));

type Row = { id: string; name: string };

const make = () =>
  createRemoteStore<Row>({
    itemType: "word",
    idOf: (row) => row.id,
    nameOf: (row) => row.name,
    fromRow: (row) => ({ id: String(row.id), name: String(row.name) }),
    toPayload: (row) => ({ id: row.id, title: row.name }),
  });

describe("findByName", () => {
  it("matches the way every name in the app is matched", () => {
    const store = make();
    store.insert({ id: "1", name: "Tür" });

    // Case, surrounding space and a decomposed accent all fold together,
    // because this goes through `foldName` like the rest of the app.
    expect(store.findByName("tür")?.id).toBe("1");
    expect(store.findByName("  TÜR  ")?.id).toBe("1");
    expect(store.findByName("Tür")?.id).toBe("1");
    expect(store.findByName("Tur")).toBeUndefined();
  });

  it("ignores the row being renamed, so it cannot clash with itself", () => {
    const store = make();
    store.insert({ id: "1", name: "Tür" });

    expect(store.findByName("Tür", "1")).toBeUndefined();
    expect(store.findByName("Tür", "2")?.id).toBe("1");
  });

  it("finds nothing for a blank name rather than the first row", () => {
    const store = make();
    store.insert({ id: "1", name: "Tür" });

    expect(store.findByName("")).toBeUndefined();
    expect(store.findByName("   ")).toBeUndefined();
  });
});

describe("removeMany", () => {
  it("counts only what was actually there", () => {
    const store = make();
    store.insertMany([
      { id: "1", name: "a" },
      { id: "2", name: "b" },
    ]);

    // A stale selection naming a row that has since gone must not inflate
    // the count the confirmation dialog reports back.
    expect(store.removeMany(["1", "nope"])).toBe(1);
    expect(store.items().map((row) => row.id)).toEqual(["2"]);
  });

  it("ignores repeats in the ids it is given", () => {
    const store = make();
    store.insert({ id: "1", name: "a" });

    expect(store.removeMany(["1", "1", "1"])).toBe(1);
  });

  it("does nothing, and says so, when none of the ids are present", () => {
    const store = make();
    store.insert({ id: "1", name: "a" });

    expect(store.removeMany(["missing"])).toBe(0);
    expect(store.items()).toHaveLength(1);
  });
});

describe("the helpers survive being handed out detached", () => {
  /**
   * The stores re-export these as bare functions:
   *
   *     export const deleteEntries = store.removeMany;
   *
   * which strips the receiver. An implementation reaching through `this`
   * would throw here and nowhere else, since every other test calls them as
   * methods. This is the shape the four stores actually use.
   */
  it("works when removeMany is pulled off the store", () => {
    const store = make();
    store.insertMany([
      { id: "1", name: "a" },
      { id: "2", name: "b" },
    ]);

    const deleteRows = store.removeMany;
    expect(() => deleteRows(["1"])).not.toThrow();
    expect(deleteRows(["2"])).toBe(1);
  });

  it("works when findByName is pulled off the store", () => {
    const store = make();
    store.insert({ id: "1", name: "Tür" });

    const findByName = store.findByName;
    expect(() => findByName("Tür")).not.toThrow();
    expect(findByName("tür")?.id).toBe("1");
  });
});

describe("flattenRow", () => {
  it("reads the source, the collections in order, and the one topic off an items row", async () => {
    const { flattenRow } = await import("@/lib/remoteStore");
    const row = flattenRow({
      id: "a",
      sources: { name: "Manual" },
      item_tags: [
        { position: 2, context: "collection", tags: { name: "Home" } },
        { position: 1, context: "grammar", tags: { name: "Cases" } },
        { position: 1, context: "collection", tags: { name: "Food" } },
      ],
    });
    expect(row.source).toBe("Manual");
    expect(row.collections).toEqual(["Food", "Home"]);
    expect(row.topic).toBe("Cases");
  });

  it("reads no topic and no source as empty strings", async () => {
    const { flattenRow } = await import("@/lib/remoteStore");
    const row = flattenRow({ id: "a", sources: null, item_tags: [] });
    expect(row.topic).toBe("");
    expect(row.source).toBe("");
  });
});
