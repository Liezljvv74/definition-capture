import { describe, expect, it } from "vitest";

import { parseVerbTable, toWireVerbTable } from "@/lib/verbTables";

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
