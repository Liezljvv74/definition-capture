/**
 * The grammar rule store, built on the same factory as the other three
 * lists: synchronous reads, optimistic writes, and a reload putting the
 * truth back when a write fails. See `remoteStore.ts`.
 *
 * A rule is an `items` row of type `grammar`; its topic travels as a name,
 * which `save_items` resolves to the tag and creates when missing.
 */

import { MAX_NAME } from "@/lib/constants";
import { rewriteLinks } from "@/lib/linkRenames";
import { readBlocks } from "@/lib/blocks";
import { importInto } from "@/lib/planImport";
import { createId, createRemoteStore } from "@/lib/remoteStore";
import {
  readString,
  type Block,
  type ImportCounts,
  type ImportMode,
  type Rule,
  type RuleInput,
} from "@/lib/types";

/** An `items` row as a rule, and back. Exported for the test that holds the pair together. */
export function fromRuleRow(row: Record<string, unknown>): Rule | null {
  const id = readString(row.id);
  const title = readString(row.title).trim();
  if (!id || !title) return null;

  const dateAdded = readString(row.created_at);
  const updatedAt = readString(row.updated_at);
  return {
    id,
    title,
    topic: readString(row.topic).trim(),
    blocks: readBlocks(row.blocks),
    dateAdded,
    // The database starts `updated_at` at `created_at`; equal means never edited.
    dateUpdated: updatedAt && updatedAt !== dateAdded ? updatedAt : null,
  };
}

export function toRulePayload(rule: Rule): Record<string, unknown> {
  return {
    id: rule.id,
    title: rule.title,
    topic: rule.topic,
    blocks: rule.blocks,
    // Used for a new row only; an existing one keeps its dates in the database.
    created_at: rule.dateAdded,
    updated_at: rule.dateUpdated ?? undefined,
  };
}

/** A rule as a backup file spells it. Declared for the reason `WireWord` is. */
export type WireRule = {
  id: string;
  title: string;
  topic: string;
  blocks: Block[];
  dateAdded: string;
  dateUpdated: string | null;
};

export function toWireRule(rule: Rule): WireRule {
  return {
    id: rule.id,
    title: rule.title,
    topic: rule.topic,
    blocks: rule.blocks,
    dateAdded: rule.dateAdded,
    dateUpdated: rule.dateUpdated,
  };
}

/**
 * A rule off a backup file. `allowMissingId` is for imported files, where a
 * hand-written one may have no id yet; the caller assigns one.
 */
export function parseRule(raw: unknown, allowMissingId = false): Rule | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;

  const rawId = readString(value.id).trim();
  const id = rawId || (allowMissingId ? "" : null);
  const title = readString(value.title).trim() || null;
  const topic = readString(value.topic).trim();
  // `save_items` refuses a rule with no topic, and one bad row must not sink
  // the rest of the file's rules. Treating a blank topic as unreadable here,
  // the same as a missing title, means the import dialog counts it among the
  // rows it could not read instead of sending the whole batch to a call that
  // was always going to be rejected.
  if (id === null || !title || !topic) return null;

  return {
    id,
    title,
    topic,
    blocks: readBlocks(value.blocks),
    dateAdded: readString(value.dateAdded) || new Date().toISOString(),
    dateUpdated: typeof value.dateUpdated === "string" ? value.dateUpdated : null,
  };
}

const store = createRemoteStore<Rule>({
  itemType: "grammar",
  idOf: (rule) => rule.id,
  nameOf: (rule) => rule.title,
  fromRow: fromRuleRow,
  toPayload: toRulePayload,
});

export const {
  subscribe,
  getSnapshot,
  getServerSnapshot,
  clearError,
  subscribeToError,
  getError,
  settled,
  reload,
  items: getRules,
  updateMany: updateRules,
} = store;

/* ----------------------------------------------------------------- queries */

/** Case-insensitive, and blind to how an accent is encoded, the way every name in the app is matched. */
export const findByTitle = store.findByName;

/**
 * The characters a link's markup itself uses. Exported so anything else that
 * offers a name to link to, such as `LinkToDialog`, can leave the same names
 * out that `titleProblem` below would refuse, rather than a second copy of
 * the pattern drifting from this one.
 */
export const LINK_CHARS = /[|[\]]/;

/**
 * A message when `title` cannot be linked to, else null. A link is written
 * `[[Name]]` or `[[Name|words]]`, so a name holding `|`, `[` or `]` would
 * either break the markup or be read as a different name than the one saved.
 */
export function titleProblem(title: string): string | null {
  return LINK_CHARS.test(title) ? "A title cannot contain |, [ or ], because links are written with them." : null;
}

/**
 * Why a rule cannot be saved under `title` and `topic`, else null: a clash
 * with another rule (other than `exceptId`, the one being edited), then a
 * title that cannot be linked to, then an empty topic. One chain, so the
 * dialogs that create and the editor that renames say the same thing.
 */
export function ruleProblem(title: string, topic: string, exceptId?: string): string | null {
  const clash = findByTitle(title, exceptId);
  if (clash) return `There is already a rule called “${clash.title}”.`;
  return titleProblem(title) ?? (topic.trim() === "" ? "A rule needs a topic." : null);
}

/* --------------------------------------------------------------- mutations */

/**
 * A rule's title and topic as they are stored: trimmed, the same way on create
 * and on update. A topic is a tag, which the database holds to 60 characters
 * (`tags_name_check`); a longer one, such as a whole sentence the tutor wrote
 * as a topic (7 October 2026), made the save fail after the page had moved on.
 */
export const cleanNames = (input: { title: string; topic: string }) => ({
  title: input.title.trim(),
  topic: input.topic.trim().slice(0, MAX_NAME).trim(),
});

/** A new rule, empty unless `blocks` is given; one insert either way, so a caller never needs a second save that could race it. */
export function createRule(input: { title: string; topic: string; blocks?: Block[] }): Rule {
  const rule: Rule = {
    id: createId(),
    ...cleanNames(input),
    blocks: input.blocks ?? [],
    dateAdded: new Date().toISOString(),
    dateUpdated: null,
  };
  store.insert(rule);
  return rule;
}

export function updateRule(id: string, input: RuleInput): Rule | null {
  const existing = store.items().find((rule) => rule.id === id);
  if (!existing) return null;
  const updated: Rule = {
    ...existing,
    ...cleanNames(input),
    blocks: input.blocks,
    dateUpdated: new Date().toISOString(),
  };
  store.update(updated);
  rewriteLinks("rule", id, existing.title, updated.title);
  return updated;
}

/**
 * Deletes the rules, then takes every link to them out of the text that held
 * one (the owner's rule, 7 October 2026), so no dotted link to a rule that is
 * gone is left behind. The rules leave the store first, so the rewrite can
 * never write one of them back.
 */
export function deleteRules(ids: readonly string[]): number {
  const doomed = store.items().filter((rule) => ids.includes(rule.id));
  const removed = store.removeMany(ids);
  for (const rule of doomed) rewriteLinks("rule", rule.id, rule.title, null);
  return removed;
}

/* ------------------------------------------------------------------ import */

/** Matched by title, the rule the unique index and links already use. */
export function importRules(incoming: Rule[], mode: ImportMode): ImportCounts {
  return importInto(store, incoming, mode, (existing, candidate) => ({ ...candidate, id: existing.id }));
}
