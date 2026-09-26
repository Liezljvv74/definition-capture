/**
 * The grammar rule store, built on the same factory as the other three
 * lists: synchronous reads, optimistic writes, and a reload putting the
 * truth back when a write fails. See `remoteStore.ts`.
 *
 * A rule is an `items` row of type `grammar`; its topic travels as a name,
 * which `save_items` resolves to the tag and creates when missing.
 */

import { readBlocks } from "@/lib/blocks";
import { foldName } from "@/lib/foldName";
import { planImport } from "@/lib/planImport";
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
  if (id === null || !title) return null;

  return {
    id,
    title,
    topic: readString(value.topic).trim(),
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

export const subscribe = store.subscribe;
export const getSnapshot = store.getSnapshot;
export const getServerSnapshot = store.getServerSnapshot;
export const clearError = store.clearError;
export const subscribeToError = store.subscribeToError;
export const getError = store.getError;
export const settled = store.settled;
export const reload = store.reload;

/* ----------------------------------------------------------------- queries */

export function getRules(): Rule[] {
  return store.items();
}

/** Case- and accent-insensitive, the way every name in the app is matched. */
export const findByTitle = store.findByName;

/* --------------------------------------------------------------- mutations */

/** A new, empty rule; the reader fills it in on its own page. */
export function createRule(input: { title: string; topic: string }): Rule {
  const rule: Rule = {
    id: createId(),
    title: input.title.trim(),
    topic: input.topic.trim(),
    blocks: [],
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
    title: input.title.trim(),
    topic: input.topic.trim(),
    blocks: input.blocks,
    dateUpdated: new Date().toISOString(),
  };
  store.update(updated);
  return updated;
}

export const deleteRules = store.removeMany;

/* ------------------------------------------------------------------ import */

export function parseRuleList(list: unknown[]): { rules: Rule[]; unreadable: number } {
  const rules = list
    .map((item) => parseRule(item, true))
    .filter((rule): rule is Rule => rule !== null);
  return { rules, unreadable: list.length - rules.length };
}

/** Matched by title, the rule the unique index and links already use. */
export function importRules(incoming: Rule[], mode: ImportMode): ImportCounts {
  const plan = planImport(store.items(), incoming, mode, {
    keyOf: (rule) => foldName(rule.title),
    idOf: (rule) => rule.id,
    withId: (rule, id) => ({ ...rule, id }),
    merge: (existing, candidate) => ({ ...candidate, id: existing.id }),
  });

  if (plan.toReplace) {
    store.replaceAll(plan.toReplace);
    return plan.counts;
  }
  store.updateMany(plan.toUpdate);
  store.insertMany(plan.toInsert);
  return plan.counts;
}
