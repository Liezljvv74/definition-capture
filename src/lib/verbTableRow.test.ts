import { describe, expect, it } from "vitest";

import { foldName } from "@/lib/foldName";
import { planImport } from "@/lib/planImport";
import type { VerbTable } from "@/lib/types";
import { mergeVerbTable, parseVerbTable, toWireVerbTable } from "@/lib/verbTables";

describe("verb table notes", () => {
  it("reads a table from before notes existed as having none", () => {
    const table = parseVerbTable({ id: "t1", verb: "gehen", tenses: ["Present"], rows: [] });
    expect(table?.ref).toBe("");
  });

  it("carries notes through a backup round trip", () => {
    const table = parseVerbTable({ id: "t1", verb: "sein", tenses: [""], rows: [], ref: "see [[Dativ]]" });
    expect(table?.ref).toBe("see [[Dativ]]");
    expect(parseVerbTable(toWireVerbTable(table!))?.ref).toBe("see [[Dativ]]");
  });
});

/**
 * Important 2 of the final review: restoring a pre-notes backup must not wipe
 * a table's notes in Update mode, and a file that spells the field empty must
 * still be taken at its word.
 */
describe("mergeVerbTable", () => {
  const existing: VerbTable = {
    id: "t1",
    verb: "sein",
    tenses: ["Present"],
    rows: [],
    ref: "see [[Dativ]]",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("keeps the existing notes when the file item has no ref key at all", () => {
    const candidate = parseVerbTable({ id: "t1", verb: "sein", tenses: ["Present"], rows: [] })!;
    expect(candidate.refKeyMissing).toBe(true);
    expect(mergeVerbTable(existing, candidate).ref).toBe("see [[Dativ]]");
  });

  it("clears the notes when the file spells the field as an empty string", () => {
    const candidate = parseVerbTable({
      id: "t1",
      verb: "sein",
      tenses: ["Present"],
      rows: [],
      ref: "",
    })!;
    expect(candidate.refKeyMissing).toBeUndefined();
    expect(mergeVerbTable(existing, candidate).ref).toBe("");
  });
});

/**
 * Replace does not consult `refKeyMissing`: it saves the file over the list,
 * so a matched row's notes become whatever the file records for it, blank or
 * missing alike, the same as every other field. This is the behaviour
 * `importVerbTables` chose for Replace; see the comment beside its own call.
 */
describe("Replace and a missing ref key", () => {
  it("writes an empty string, not the row's existing notes, when the file has no ref key", () => {
    const candidate = parseVerbTable(
      { id: "t1", verb: "sein", tenses: ["Present"], rows: [] },
      true,
    )!;
    const plan = planImport(
      [
        {
          id: "t1",
          verb: "sein",
          tenses: ["Present"],
          rows: [],
          ref: "see [[Dativ]]",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      [candidate],
      "replace",
      {
        keyOf: (table: VerbTable) => foldName(table.verb),
        idOf: (table: VerbTable) => table.id,
        withId: (table: VerbTable, id: string) => ({ ...table, id }),
        merge: mergeVerbTable,
      },
    );
    expect(plan.toReplace?.[0].ref).toBe("");
  });
});
