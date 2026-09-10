/**
 * The conjugation tables, one per verb.
 *
 * Built on the same factory as the term and phrase lists, so it reads
 * synchronously, writes optimistically, and reports a failed write the same
 * way they do. Nothing new is invented here — see `remoteStore.ts`.
 *
 * A table belongs to a verb by name. That is what lets the Edit term screen
 * ask "does this word have a table yet?" without storing a second key, and it
 * is the same rule `[[Name]]` links already follow.
 */

import { createId, createRemoteStore } from "@/lib/remoteStore";
import {
  readString,
  readTenses,
  readVerbRows,
  type VerbRow,
  type VerbTable,
} from "@/lib/types";

const store = createRemoteStore<VerbTable>({
  table: "verb_tables",
  orderBy: "created_at",
  idOf: (table) => table.id,

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

/* ----------------------------------------------------------------- queries */

export function getVerbTables(): VerbTable[] {
  return store.items();
}

/** The table for a verb, matched the way the term list matches its names. */
export function findVerbTable(verb: string): VerbTable | undefined {
  const needle = verb.trim().toLocaleLowerCase();
  if (!needle) return undefined;
  return store
    .items()
    .find((table) => table.verb.toLocaleLowerCase() === needle);
}

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
