import { describe, expect, it } from "vitest";

import { foldName } from "@/lib/foldName";
import { planImport, type ImportRules } from "@/lib/planImport";

type Row = { id: string; name: string; body: string };

const row = (name: string, body = "", id = crypto.randomUUID()): Row => ({
  id,
  name,
  body,
});

const rules: ImportRules<Row> = {
  keyOf: (item) => foldName(item.name),
  idOf: (item) => item.id,
  withId: (item, id) => ({ ...item, id }),
  merge: (existing, candidate) => ({ ...existing, ...candidate, id: existing.id }),
};

const plan = (existing: Row[], incoming: Row[], mode: "skip" | "update" | "replace") =>
  planImport(existing, incoming, mode, rules);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("planImport — skip", () => {
  it("adds what is new and leaves matching rows alone", () => {
    const mine = [row("Tür", "door")];
    const result = plan(mine, [row("Tür", "CHANGED"), row("Buch", "book")], "skip");

    expect(result.counts).toEqual({ added: 1, updated: 0, skipped: 1 });
    expect(result.toUpdate).toEqual([]);
    expect(result.toInsert.map((r) => r.name)).toEqual(["Buch"]);
  });
});

describe("planImport — update", () => {
  it("overwrites a matching row but keeps its id", () => {
    const mine = [row("Tür", "door", "11111111-1111-1111-1111-111111111111")];
    const result = plan(mine, [row("Tür", "doorway")], "update");

    expect(result.counts).toEqual({ added: 0, updated: 1, skipped: 0 });
    expect(result.toUpdate).toHaveLength(1);
    expect(result.toUpdate[0]).toMatchObject({
      id: "11111111-1111-1111-1111-111111111111",
      body: "doorway",
    });
  });

  it("matches case- and accent-insensitively, the way the add form does", () => {
    const mine = [row("Tür", "door")];
    // Decomposed "u" + combining diaeresis: a different string, the same word.
    const result = plan(mine, [row("tür", "doorway")], "update");

    expect(result.counts.updated).toBe(1);
    expect(result.counts.added).toBe(0);
  });
});

describe("planImport — a file that names the same row twice", () => {
  /**
   * The bug this extraction exists for. New rows are inserted after the loop,
   * so a second copy used to match a row that was not in the store yet: the
   * update addressed a row that did not exist, wrote nothing, and still
   * counted one. The second copy vanished without a word.
   */
  it("keeps the last copy when both are new", () => {
    const result = plan([], [row("Tür", "first"), row("tür", "second")], "update");

    expect(result.toUpdate).toEqual([]);
    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0].body).toBe("second");
    expect(result.counts).toEqual({ added: 1, updated: 1, skipped: 0 });
  });

  it("merges a third copy onto the second, not back onto the first", () => {
    const result = plan(
      [],
      [row("Tür", "first"), row("Tür", "second"), row("Tür", "third")],
      "update",
    );

    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0].body).toBe("third");
  });

  it("does not lose an unrelated row that follows the duplicate", () => {
    const result = plan(
      [],
      [row("Tür", "a"), row("Tür", "b"), row("Buch", "c")],
      "update",
    );

    expect(result.toInsert.map((r) => r.name)).toEqual(["Tür", "Buch"]);
  });

  it("counts the repeat as skipped, and inserts once, in skip mode", () => {
    const result = plan([], [row("Tür", "first"), row("Tür", "second")], "skip");

    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0].body).toBe("first");
    expect(result.counts).toEqual({ added: 1, updated: 0, skipped: 1 });
  });
});

describe("planImport — replace", () => {
  it("returns the whole list and nothing else", () => {
    const result = plan([row("Old")], [row("Tür"), row("Buch")], "replace");

    expect(result.toReplace?.map((r) => r.name)).toEqual(["Tür", "Buch"]);
    expect(result.toUpdate).toEqual([]);
    expect(result.toInsert).toEqual([]);
    expect(result.counts).toEqual({ added: 2, updated: 0, skipped: 0 });
  });

  it("de-duplicates by name before anything is written", () => {
    // `replaceAll` deletes the old list before inserting the new one, so a
    // duplicate reaching the database would be refused by the unique index
    // *after* the delete — leaving the list empty rather than restored.
    const result = plan([], [row("Tür", "a"), row("TÜR", "b")], "replace");

    expect(result.toReplace).toHaveLength(1);
    expect(result.toReplace?.[0].body).toBe("b");
    expect(result.counts.added).toBe(1);
  });

  it("reports the de-duplicated count, not the file's row count", () => {
    const result = plan([], [row("a"), row("a"), row("a")], "replace");
    expect(result.counts.added).toBe(1);
  });

  it("is null for toReplace in the merge modes, so the caller cannot confuse them", () => {
    expect(plan([], [row("a")], "skip").toReplace).toBeNull();
    expect(plan([], [row("a")], "update").toReplace).toBeNull();
  });
});

describe("planImport — ids", () => {
  it("keeps a usable uuid", () => {
    const id = "22222222-2222-2222-2222-222222222222";
    const result = plan([], [row("Tür", "", id)], "update");
    expect(result.toInsert[0].id).toBe(id);
  });

  it("re-mints an id the localStorage era would have produced", () => {
    // Short random strings are not uuids and the primary key refuses them.
    const result = plan([], [row("Tür", "", "abc123")], "update");
    expect(result.toInsert[0].id).toMatch(UUID);
    expect(result.toInsert[0].id).not.toBe("abc123");
  });

  it("re-mints the second of two rows sharing an id in one file", () => {
    const id = "33333333-3333-3333-3333-333333333333";
    const result = plan([], [row("Tür", "", id), row("Buch", "", id)], "update");

    expect(result.toInsert[0].id).toBe(id);
    expect(result.toInsert[1].id).toMatch(UUID);
    expect(result.toInsert[1].id).not.toBe(id);
  });

  it("re-mints an id that an existing row already holds", () => {
    const id = "44444444-4444-4444-4444-444444444444";
    const result = plan([row("Buch", "", id)], [row("Tür", "", id)], "update");

    expect(result.toInsert[0].id).not.toBe(id);
    expect(result.toInsert[0].id).toMatch(UUID);
  });

  it("re-mints duplicate ids in replace mode too", () => {
    const id = "55555555-5555-5555-5555-555555555555";
    const result = plan([], [row("a", "", id), row("b", "", id)], "replace");

    expect(result.toReplace?.[0].id).toBe(id);
    expect(result.toReplace?.[1].id).not.toBe(id);
  });
});

describe("planImport — nothing to do", () => {
  it("returns empty plans for an empty file", () => {
    for (const mode of ["skip", "update"] as const) {
      const result = plan([row("Tür")], [], mode);
      expect(result.counts).toEqual({ added: 0, updated: 0, skipped: 0 });
      expect(result.toInsert).toEqual([]);
      expect(result.toUpdate).toEqual([]);
    }
  });

  it("does not mutate what it was given", () => {
    const mine = [row("Tür", "door")];
    const snapshot = structuredClone(mine);
    plan(mine, [row("Tür", "changed"), row("Buch")], "update");
    expect(mine).toEqual(snapshot);
  });
});
