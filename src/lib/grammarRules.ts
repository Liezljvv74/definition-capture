/**
 * The grammar rule store — the fourth list, built on the same factory as the
 * other three, so it reads synchronously, writes optimistically, and reports
 * a failed write the same way they do. Nothing new is invented here; see
 * `remoteStore.ts`.
 *
 * Rules are matched by title, the same rule the term and phrase lists use for
 * their own names and the same rule the unique index enforces.
 */

import { foldName } from "@/lib/foldName";
import { planImport } from "@/lib/planImport";
import { createId, createRemoteStore } from "@/lib/remoteStore";
import {
  readString,
  type GrammarRule,
  type GrammarRuleInput,
  type ImportCounts,
  type ImportMode,
} from "@/lib/types";

/**
 * Turns unknown JSON into a GrammarRule, or null if it is unusable. This
 * reads the camelCase shape a backup file uses; database rows go through
 * `fromRow`.
 */
export function parseGrammarRule(
  raw: unknown,
  allowMissingId = false,
): GrammarRule | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;

  const rawId = readString(value.id).trim();
  const id = rawId || (allowMissingId ? "" : null);
  const title = readString(value.title).trim() || null;
  if (id === null || !title) return null;

  return {
    id,
    title,
    category: readString(value.category).trim(),
    explanation: readString(value.explanation),
    examples: readString(value.examples),
    ref: readString(value.ref),
    createdAt: readString(value.createdAt) || new Date().toISOString(),
  };
}

const store = createRemoteStore<GrammarRule>({
  table: "grammar_rules",
  orderBy: "created_at",
  idOf: (rule) => rule.id,

  fromRow(row) {
    const id = readString(row.id);
    const title = readString(row.title).trim();
    if (!id || !title) return null;

    return {
      id,
      title,
      category: readString(row.category).trim(),
      explanation: readString(row.explanation),
      examples: readString(row.examples),
      ref: readString(row.ref),
      createdAt: readString(row.created_at),
    };
  },

  toRow: (rule) => ({
    id: rule.id,
    title: rule.title,
    category: rule.category,
    explanation: rule.explanation,
    examples: rule.examples,
    ref: rule.ref,
    created_at: rule.createdAt,
    updated_at: new Date().toISOString(),
  }),
});

export const subscribe = store.subscribe;
export const getSnapshot = store.getSnapshot;
export const getServerSnapshot = store.getServerSnapshot;
export const clearError = store.clearError;
export const subscribeToError = store.subscribeToError;
export const getError = store.getError;

/* --------------------------------------------------------------- mutations */

function clean(input: GrammarRuleInput) {
  return {
    title: input.title.trim(),
    category: input.category.trim(),
    explanation: input.explanation.trim(),
    examples: input.examples.trim(),
    ref: input.ref.trim(),
  };
}

export function createGrammarRule(input: GrammarRuleInput): GrammarRule {
  const rule: GrammarRule = {
    id: createId(),
    ...clean(input),
    createdAt: new Date().toISOString(),
  };
  store.insert(rule);
  return rule;
}

export function updateGrammarRule(
  id: string,
  input: GrammarRuleInput,
): GrammarRule | null {
  const existing = store.items().find((rule) => rule.id === id);
  if (!existing) return null;

  const updated: GrammarRule = { ...existing, ...clean(input) };
  store.update(updated);
  return updated;
}

/** Many removals, one write — the same as the other lists. */
export function deleteGrammarRules(ids: readonly string[]): number {
  const present = new Set(store.items().map((rule) => rule.id));
  const doomed = [...new Set(ids)].filter((id) => present.has(id));
  if (doomed.length === 0) return 0;

  store.remove(doomed);
  return doomed.length;
}

/* ----------------------------------------------------------------- queries */

export function getGrammarRules(): GrammarRule[] {
  return store.items();
}

/** Case-insensitive title lookup, for the duplicate check before saving. */
export function findByTitle(title: string, ignoreId?: string): GrammarRule | undefined {
  const needle = foldName(title);
  if (!needle) return undefined;
  return store
    .items()
    .find((rule) => rule.id !== ignoreId && foldName(rule.title) === needle);
}

/* ------------------------------------------------------------------ import */

export function parseGrammarRuleList(list: unknown[]): {
  rules: GrammarRule[];
  unreadable: number;
} {
  const rules = list
    .map((item) => parseGrammarRule(item, true))
    .filter((rule): rule is GrammarRule => rule !== null);
  return { rules, unreadable: list.length - rules.length };
}

/** Matched by title, mirroring how the term list matches on terms. */
export function importGrammarRules(
  incoming: GrammarRule[],
  mode: ImportMode,
): ImportCounts {
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
