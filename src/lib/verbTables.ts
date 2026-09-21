/**
 * The conjugation tables, one per verb.
 *
 * Built on the same factory as the word and phrase lists, so it reads
 * synchronously, writes optimistically, and reports a failed write the same
 * way they do. Nothing new is invented here — see `remoteStore.ts`.
 *
 * A table belongs to a verb by name. That is what lets the Edit word screen
 * ask "does this word have a table yet?" without storing a second key, and it
 * is the same rule `[[Name]]` links already follow.
 */

import { foldName } from "@/lib/foldName";
import { planImport } from "@/lib/planImport";
import { createId, createRemoteStore } from "@/lib/remoteStore";
import {
  readString,
  readTenses,
  readVerbRows,
  type ImportCounts,
  type ImportMode,
  type VerbRow,
  type VerbTable,
} from "@/lib/types";

const store = createRemoteStore<VerbTable>({
  table: "verb_tables",
  orderBy: "created_at",
  idOf: (table) => table.id,
  nameOf: (table) => table.verb,

  fromRow(row) {
    const id = readString(row.id);
    const verb = readString(row.verb).trim();
    if (!id || !verb) return null;

    const tenses = readTenses(row.tenses);
    return {
      id,
      verb,
      tenses,
      rows: readVerbRows(row.rows, tenses.length),
      createdAt: readString(row.created_at),
    };
  },

  toRow: (table) => ({
    id: table.id,
    verb: table.verb,
    tenses: table.tenses,
    rows: table.rows,
    created_at: table.createdAt,
    updated_at: new Date().toISOString(),
  }),
});

export const subscribe = store.subscribe;
export const getSnapshot = store.getSnapshot;
export const getServerSnapshot = store.getServerSnapshot;
export const clearError = store.clearError;
export const subscribeToError = store.subscribeToError;
export const getError = store.getError;

/* ----------------------------------------------------------------- queries */

export function getVerbTables(): VerbTable[] {
  return store.items();
}

/** The table for a verb, matched the way the word list matches its names. */
const findVerbTable = store.findByName;

/* --------------------------------------------------------------- mutations */

/**
 * Starts a table for a verb, one empty row per configured person. Returns the
 * existing one untouched if there already is one, so a double click cannot
 * produce a duplicate the unique index would refuse anyway.
 */
export function createVerbTable(
  verb: string,
  persons: readonly string[],
  tense: string,
): VerbTable {
  const existing = findVerbTable(verb);
  if (existing) return existing;

  const table: VerbTable = {
    id: createId(),
    verb: verb.trim(),
    tenses: [tense.trim()],
    rows: persons.map((person) => ({ person, conjugations: [""], notes: "" })),
    createdAt: new Date().toISOString(),
  };
  store.insert(table);
  return table;
}

/**
 * Saves the columns and what has been written into them. Both together,
 * because a tense and its conjugations are the same edit: saving one
 * without the other would leave the headings and the rows disagreeing.
 */
export function saveVerbTable(id: string, tenses: string[], rows: VerbRow[]): void {
  const existing = store.items().find((table) => table.id === id);
  if (!existing) return;
  store.update({ ...existing, tenses, rows });
}

export function deleteVerbTable(id: string): void {
  store.remove([id]);
}

/* ------------------------------------------------------------------ import */

/**
 * Turns unknown JSON into a VerbTable, or null if it is unusable. This reads
 * the camelCase shape a backup file uses; database rows go through `fromRow`.
 *
 * `rows` is read against the tense count, so the invariant the whole table
 * depends on — one conjugation per column, no more and no fewer — holds for a
 * hand-edited backup exactly as it does for a row out of the database.
 */
/**
 * A conjugation table as a backup file spells it. Declared for the reason
 * `WireWord` is.
 *
 * The rows are copied one by one rather than passed through, so that a field
 * added to `VerbRow` for the screen's benefit does not silently start
 * appearing in every reader's backups.
 */
export type WireVerbTable = {
  id: string;
  verb: string;
  tenses: string[];
  rows: { person: string; conjugations: string[]; notes: string }[];
  createdAt: string;
};

/** The counterpart to `parseVerbTable`: one table on its way into a file. */
export function toWireVerbTable(table: VerbTable): WireVerbTable {
  return {
    id: table.id,
    verb: table.verb,
    tenses: table.tenses,
    rows: table.rows.map((row) => ({
      person: row.person,
      conjugations: row.conjugations,
      notes: row.notes,
    })),
    createdAt: table.createdAt,
  };
}

export function parseVerbTable(raw: unknown, allowMissingId = false): VerbTable | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;

  const rawId = readString(value.id).trim();
  const id = rawId || (allowMissingId ? "" : null);
  const verb = readString(value.verb).trim() || null;
  if (id === null || !verb) return null;

  const tenses = readTenses(value.tenses);
  return {
    id,
    verb,
    tenses,
    rows: readVerbRows(value.rows, tenses.length),
    createdAt: readString(value.createdAt) || new Date().toISOString(),
  };
}

export function parseVerbTableList(list: unknown[]): {
  tables: VerbTable[];
  unreadable: number;
} {
  const tables = list
    .map((item) => parseVerbTable(item, true))
    .filter((table): table is VerbTable => table !== null);
  return { tables, unreadable: list.length - tables.length };
}

/**
 * Merges imported tables into the list. Matched by verb name, which is the
 * same rule `findVerbTable` and the unique index already use — a second table
 * for the same verb is not a thing that can exist.
 */
export function importVerbTables(incoming: VerbTable[], mode: ImportMode): ImportCounts {
  const plan = planImport(store.items(), incoming, mode, {
    keyOf: (table) => foldName(table.verb),
    idOf: (table) => table.id,
    withId: (table, id) => ({ ...table, id }),
    // Columns and cells travel together, for the reason `saveVerbTable`
    // gives: taking one from the backup and leaving the other would put the
    // headings and the rows out of step.
    merge: (existing, candidate) => ({
      ...existing,
      verb: candidate.verb,
      tenses: candidate.tenses,
      rows: candidate.rows,
    }),
  });

  if (plan.toReplace) {
    store.replaceAll(plan.toReplace);
    return plan.counts;
  }

  store.updateMany(plan.toUpdate);
  store.insertMany(plan.toInsert);
  return plan.counts;
}
