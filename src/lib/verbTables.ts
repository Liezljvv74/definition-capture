/**
 * The conjugation tables, one per verb.
 *
 * Built on the same factory as the word and phrase lists, so it reads
 * synchronously, writes optimistically, and reports a failed write the same
 * way they do. Nothing new is invented here; see `remoteStore.ts`.
 *
 * A table belongs to a verb by name. That is what lets the Edit word screen
 * ask "does this word have a table yet?" without storing a second key, and it
 * is the same rule `[[Name]]` links already follow.
 */

import { rewriteLinks } from "@/lib/linkRenames";
import { importInto } from "@/lib/planImport";
import { createRemoteStore } from "@/lib/remoteStore";
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
  itemType: "verb_table",
  idOf: (table) => table.id,
  nameOf: (table) => table.verb,

  fromRow(row) {
    const id = readString(row.id);
    const verb = readString(row.title).trim();
    if (!id || !verb) return null;

    const tenses = readTenses(row.tenses);
    return {
      id,
      verb,
      tenses,
      rows: readVerbRows(row.verb_rows, tenses.length),
      ref: readString(row.ref),
      createdAt: readString(row.created_at),
    };
  },

  // No `source` and no `collections`: a table has neither, and leaving the
  // keys out tells `save_items` to leave that part of the row alone.
  toPayload: (table) => ({
    id: table.id,
    title: table.verb,
    tenses: table.tenses,
    verb_rows: table.rows,
    ref: table.ref,
    created_at: table.createdAt,
  }),
});

export const {
  subscribe,
  getSnapshot,
  getServerSnapshot,
  clearError,
  subscribeToError,
  getError,
  items: getVerbTables,
  // The rename rewrite in `linkRenames` updates many tables at once with this.
  updateMany: updateVerbTables,
} = store;

/* ----------------------------------------------------------------- queries */

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
    id: crypto.randomUUID(),
    verb: verb.trim(),
    tenses: [tense.trim()],
    rows: persons.map((person) => ({ person, conjugations: [""], notes: "" })),
    ref: "",
    createdAt: new Date().toISOString(),
  };
  store.insert(table);
  return table;
}

/**
 * Saves the columns and what has been written into them. Both together,
 * because a tense and its conjugations are the same edit: saving one
 * without the other would leave the headings and the rows disagreeing.
 * The notes are saved with the rest of the card, by the same Save.
 */
export function saveVerbTable(id: string, tenses: string[], rows: VerbRow[], ref: string): void {
  const existing = store.items().find((table) => table.id === id);
  if (!existing) return;
  store.update({ ...existing, tenses, rows, ref: ref.trim() });
}

/** Links to a deleted verb table lose their link, as for a rule (`deleteRules`). */
export function deleteVerbTable(id: string): void {
  const doomed = store.items().find((table) => table.id === id);
  store.removeMany([id]);
  if (doomed) rewriteLinks("verb_table", doomed.id, doomed.verb, null);
}

/* ------------------------------------------------------------------ import */

/**
 * Turns unknown JSON into a VerbTable, or null if it is unusable. This reads
 * the camelCase shape a backup file uses; database rows go through `fromRow`.
 *
 * `rows` is read against the tense count, so the invariant the whole table
 * depends on (one conjugation per column, no more and no fewer) holds for a
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
  ref: string;
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
    ref: table.ref,
    createdAt: table.createdAt,
  };
}

/**
 * A table as `parseVerbTable` hands it back, with one extra fact `VerbTable`
 * itself has no business carrying: whether the file's item had no `ref` key
 * at all, as opposed to one written as `""`. `toWireVerbTable` below and the
 * database payload in `toPayload` both build their object literal field by
 * field, so this can never leak into either; only the merge in
 * `importVerbTables` reads it, in the one call `applyImport` makes moments
 * after parsing a file.
 */
export type ParsedVerbTable = VerbTable & { refKeyMissing?: true };

export function parseVerbTable(raw: unknown, allowMissingId = false): ParsedVerbTable | null {
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
    ref: readString(value.ref).trim(),
    createdAt: readString(value.createdAt) || new Date().toISOString(),
    // Set only when the key is missing outright. A file that spells the
    // field `ref: ""` is a reader's own answer and is taken at its word; only
    // silence is worth telling apart from it, which `value.ref === undefined`
    // does and a check against `""` could not.
    ...(value.ref === undefined ? { refKeyMissing: true } : {}),
  };
}

/**
 * What an existing table becomes when Update mode's merge overwrites it with
 * a candidate out of a backup file. Exported for its own test.
 *
 * Notes are the one field not simply taken from the candidate: a file from
 * before verb tables had notes carries no `ref` key at all, and taking
 * `candidate.ref` regardless would read that silence as "clear them," wiping
 * every note already saved the moment such a file was merged in. Keeping
 * `existing.ref` when `refKeyMissing` is set is what an Update merge is for
 * in the first place: touching only what the file actually says.
 */
export function mergeVerbTable(existing: VerbTable, candidate: ParsedVerbTable): VerbTable {
  return {
    ...existing,
    verb: candidate.verb,
    tenses: candidate.tenses,
    rows: candidate.rows,
    ref: candidate.refKeyMissing ? existing.ref : candidate.ref,
  };
}

/**
 * Merges imported tables into the list. Matched by verb name, which is the
 * same rule `findVerbTable` and the unique index already use: a second table
 * for the same verb is not a thing that can exist.
 */
export function importVerbTables(incoming: ParsedVerbTable[], mode: ImportMode): ImportCounts {
  // Columns and cells travel together, for the reason `saveVerbTable` gives:
  // taking one from the backup and leaving the other would put the headings
  // and the rows out of step.
  //
  // `refKeyMissing` is not consulted by Replace. Replace saves the file over
  // the list, matched rows included, so every field of a matched row becomes
  // whatever the file records for it, blank or missing alike, the same as it
  // always has for every other field on every other list. A restore is meant
  // to make the file the truth, not a selective patch. That is what tells it
  // apart from Update's merge, which is deliberately selective; Replace never
  // has been.
  return importInto<ParsedVerbTable>(store, incoming, mode, mergeVerbTable);
}
