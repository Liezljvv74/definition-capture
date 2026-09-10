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

    return {
      id,
      verb,
      rows: readVerbRows(row.rows),
      createdAt: readString(row.created_at),
    };
  },

  toRow: (table) => ({
    id: table.id,
    verb: table.verb,
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
export function createVerbTable(verb: string, persons: readonly string[]): VerbTable {
  const existing = findVerbTable(verb);
  if (existing) return existing;

  const table: VerbTable = {
    id: createId(),
    verb: verb.trim(),
    rows: persons.map((person) => ({ person, conjugation: "", notes: "" })),
    createdAt: new Date().toISOString(),
  };
  store.insert(table);
  return table;
}

/** Saves the filled-in rows. The persons themselves are settings, not data. */
export function saveVerbRows(id: string, rows: VerbRow[]): void {
  const existing = store.items().find((table) => table.id === id);
  if (!existing) return;
  store.update({ ...existing, rows });
}

export function deleteVerbTable(id: string): void {
  store.remove([id]);
}
