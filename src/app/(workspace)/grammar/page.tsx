"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { AddGrammarRuleDialog } from "@/components/AddGrammarRuleDialog";
import { CategoryBadge } from "@/components/Badges";
import {
  ConfirmDeleteDialog,
  RowDeleteButton,
  SelectAllCheckbox,
  SelectionBar,
  SelectRowCheckbox,
} from "@/components/DeleteControls";
import { EditGrammarRuleDialog } from "@/components/EditGrammarRuleDialog";
import { buildLinkIndex, RefText, type LinkIndex } from "@/components/RefText";
import { STICKY_FILTERS } from "@/components/StickyFilters";
import { RowEditButton } from "@/components/RowEditButton";
import { foldName } from "@/lib/foldName";
import { deleteGrammarRules } from "@/lib/grammarRules";
import { compareText } from "@/lib/sortName";
import type { GrammarRule } from "@/lib/types";
import { useGrammarRules } from "@/lib/useGrammarRules";
import { useListPage } from "@/lib/useListPage";
import { usePhrases } from "@/lib/usePhrases";
import { useTerms } from "@/lib/useTerms";

/** Module scope so their identity is stable across renders; see `useListPage`. */
const idOfRule = (rule: GrammarRule) => rule.id;
const nameOfRule = (rule: GrammarRule) => rule.title;

/**
 * Grammar rules: the fourth list, and what the Grammar tab was always a
 * placeholder for.
 *
 * Built the way Terms and Phrases are built, on purpose — the same store
 * factory, the same selection and delete controls, the same header. A rule is
 * a title, the group it belongs to, what it says, the examples that make it
 * land, and a Ref.
 *
 * Sorted by title rather than by date. A rule is looked up by name, the way a
 * term is, and the alphabetical order is what makes a list of them scannable.
 */
export default function GrammarPage() {
  // `useSearchParams` needs a boundary to suspend against during prerender.
  return (
    <Suspense fallback={<GrammarSkeleton />}>
      <GrammarList />
    </Suspense>
  );
}

function GrammarSkeleton() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
      <div className="card h-40 animate-pulse" aria-hidden="true" />
    </main>
  );
}

function GrammarList() {
  const { rules, loaded } = useGrammarRules();
  const { entries } = useTerms();
  const { phrases } = usePhrases();

  const [isAdding, setIsAdding] = useState(false);
  const [query, setQuery] = useState("");
  /** Empty means every category; otherwise the one being shown. */
  const [category, setCategory] = useState("");

  /**
   * Only categories actually in use, so choosing one always shows something.
   * There is no standing list to draw from — a rule's category is free text —
   * which makes what is in use the only honest source.
   */
  const categoryOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const rule of rules) {
      if (!rule.category) continue;
      const key = foldName(rule.category);
      if (!byKey.has(key)) byKey.set(key, rule.category);
    }
    // One chosen and then emptied of rules stays listed, so the dropdown
    // never shows a blank while the list explains itself.
    if (category && !byKey.has(foldName(category))) {
      byKey.set(foldName(category), category);
    }
    return [...byKey.values()].sort(compareText);
  }, [rules, category]);

  /** Sorted apart from the filter, so a keystroke does not re-sort. */
  const sorted = useMemo(
    () => [...rules].sort((a, b) => compareText(a.title, b.title)),
    [rules],
  );

  const visible = useMemo(() => {
    const needle = foldName(query);
    const wanted = foldName(category);
    return sorted.filter((rule) => {
      if (wanted && foldName(rule.category) !== wanted) return false;
      if (!needle) return true;
      return (
        foldName(rule.title).includes(needle) ||
        foldName(rule.explanation).includes(needle) ||
        foldName(rule.examples).includes(needle) ||
        foldName(rule.ref).includes(needle)
      );
    });
  }, [sorted, query, category]);

  const { selection, editing, setEditingId, pendingDelete, setPendingDelete, pendingNames } =
    useListPage(visible, idOfRule, nameOfRule);

  const linkIndex = useMemo(
    () => buildLinkIndex(entries, phrases, rules),
    [entries, phrases, rules],
  );
  const isFiltered = query.trim() !== "" || category !== "";

  /**
   * The rule a `[[Title]]` link arrived at, if any. Rules have no page of
   * their own — the list already shows the whole explanation and every
   * example, so a detail page would repeat it — so a link lands here and
   * points at the row instead.
   */
  const targetId = useSearchParams().get("rule") ?? "";
  const highlighted = rules.some((rule) => rule.id === targetId) ? targetId : "";

  useEffect(() => {
    if (!highlighted || !loaded) return;
    // After the list has rendered, not during: the row has to exist first.
    const row = document.getElementById(`rule-${highlighted}`);
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlighted, loaded]);

  return (
    <>
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Grammar</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {!loaded
                ? "Loading your rules…"
                : rules.length === 0
                  ? "Your grammar rules"
                  : `${rules.length} ${rules.length === 1 ? "rule" : "rules"}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsAdding(true)}
            >
              <span aria-hidden="true">+</span> Add rule
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {!loaded ? (
          <div className="card h-40 animate-pulse" aria-hidden="true" />
        ) : rules.length === 0 ? (
          <EmptyGrammar onAdd={() => setIsAdding(true)} />
        ) : (
          <>
            <div className={`${STICKY_FILTERS} mb-3 flex flex-wrap items-center gap-2`}>
              <div className="w-full sm:w-1/2 lg:w-1/4 lg:min-w-52">
                <label htmlFor="grammar-search" className="sr-only">
                  Search grammar rules
                </label>
                <input
                  id="grammar-search"
                  type="search"
                  className="field"
                  placeholder="Search rules…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>

              {categoryOptions.length > 0 && (
                <div className="w-full sm:w-auto">
                  <label htmlFor="grammar-category" className="sr-only">
                    Filter by category
                  </label>
                  <select
                    id="grammar-category"
                    className="field w-auto"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                  >
                    <option value="">All categories</option>
                    {categoryOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <p aria-live="polite" className="sr-only">
              {visible.length} of {rules.length} rules shown.
            </p>

            {selection.selectedIds.length > 0 && (
              <SelectionBar
                count={selection.selectedIds.length}
                noun="rule"
                nounPlural="rules"
                onDelete={() => setPendingDelete(selection.selectedIds)}
                onClear={selection.clear}
              />
            )}

            {visible.length > 0 && (
              <label className="mb-2 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <SelectAllCheckbox
                  checked={selection.allSelected}
                  indeterminate={selection.partiallySelected}
                  onChange={selection.toggleAll}
                  label="Select every rule shown"
                />
                Select all
              </label>
            )}

            <div className="space-y-3">
              {visible.map((rule) => (
                <RuleTable
                  key={rule.id}
                  rule={rule}
                  highlighted={rule.id === highlighted}
                  linkIndex={linkIndex}
                  selected={selection.isSelected(rule.id)}
                  onToggleSelected={() => selection.toggle(rule.id)}
                  onSelectCategory={setCategory}
                  onEdit={() => setEditingId(rule.id)}
                  onDelete={() => setPendingDelete([rule.id])}
                />
              ))}
            </div>

            {visible.length === 0 && <NoMatches onClear={() => { setQuery(""); setCategory(""); }} />}

            {isFiltered && visible.length > 0 && (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Showing {visible.length} of {rules.length} rules.
              </p>
            )}
          </>
        )}
      </main>

      {isAdding && (
        <AddGrammarRuleDialog onClose={() => setIsAdding(false)} />
      )}

      {editing && (
        <EditGrammarRuleDialog rule={editing} onClose={() => setEditingId(null)} />
      )}

      {pendingDelete && (
        <ConfirmDeleteDialog
          names={pendingNames}
          noun="rule"
          nounPlural="rules"
          onConfirm={() => {
            deleteGrammarRules(pendingDelete);
            selection.clear();
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}

/**
 * One rule, as its own table.
 *
 * The rules were rows in a single grid to begin with, which reads well for a
 * term list where a row is a word and a short definition. A rule is not that
 * shape: the explanation is a paragraph and the examples are several lines, so
 * a shared grid either truncates them or gives every column the width of the
 * longest one. A table per rule lets each field have the room it needs, and it
 * is the same choice the Verbs page already makes in giving each verb its own
 * conjugation table.
 *
 * It is a real `<table>` with row headers rather than a styled list, because
 * that is what it is: a field name and its value on each line.
 */
function RuleTable({
  rule,
  highlighted,
  linkIndex,
  selected,
  onToggleSelected,
  onSelectCategory,
  onEdit,
  onDelete,
}: {
  rule: GrammarRule;
  highlighted: boolean;
  linkIndex: LinkIndex;
  selected: boolean;
  onToggleSelected: () => void;
  onSelectCategory: (name: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <section
      id={`rule-${rule.id}`}
      aria-labelledby={`rule-title-${rule.id}`}
      className={`card overflow-hidden ${
        highlighted
          ? "border-indigo-400 dark:border-indigo-500"
          : ""
      }`}
    >
      <div
        className={`flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800 ${
          highlighted ? "bg-indigo-50/60 dark:bg-indigo-500/10" : "bg-slate-50 dark:bg-slate-950/50"
        }`}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="pt-0.5">
            <SelectRowCheckbox
              checked={selected}
              onChange={onToggleSelected}
              label={rule.title}
            />
          </span>
          <div className="min-w-0">
            <h2
              id={`rule-title-${rule.id}`}
              className="text-base font-semibold break-words"
            >
              {rule.title}
            </h2>
            {rule.category && (
              <button
                type="button"
                className="mt-1 cursor-pointer"
                title={`Show only ${rule.category}`}
                onClick={() => onSelectCategory(rule.category)}
              >
                <CategoryBadge name={rule.category} />
              </button>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <RowEditButton label={rule.title} onClick={onEdit} />
          <RowDeleteButton label={rule.title} onClick={onDelete} />
        </div>
      </div>

      <table className="w-full table-fixed border-collapse text-sm">
        <tbody>
          <Field label="Explanation" value={rule.explanation} />
          <Field label="Examples" value={rule.examples} italic />
          <Field label="Ref">
            {rule.ref ? <RefText value={rule.ref} linkIndex={linkIndex} /> : null}
          </Field>
        </tbody>
      </table>
    </section>
  );
}

/**
 * One line of a rule's table. Always rendered, even when empty: a rule with
 * gaps should show where the gaps are, since filling them in later is the
 * point of writing it down early.
 */
function Field({
  label,
  value,
  italic = false,
  children,
}: {
  label: string;
  value?: string;
  italic?: boolean;
  children?: React.ReactNode;
}) {
  const filled = children ?? (value ? value : null);

  return (
    <tr className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
      <th
        scope="row"
        className="w-32 px-4 py-2.5 text-left align-top text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
      >
        {label}
      </th>
      <td
        className={`px-4 py-2.5 align-top break-words whitespace-pre-wrap text-slate-700 dark:text-slate-300 ${
          italic ? "italic" : ""
        }`}
      >
        {filled ?? (
          <span className="text-slate-400 not-italic dark:text-slate-500">Not set</span>
        )}
      </td>
    </tr>
  );
}

function EmptyGrammar({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="card mx-auto max-w-xl p-8 text-center">
      <div aria-hidden="true" className="mb-3 text-4xl">
        📐
      </div>
      <h2 className="text-lg font-semibold">No grammar rules yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
        A rule is the thing you keep having to look up: which case follows a
        preposition, where the verb goes. Give it a title, say what it does, and
        add the examples that make it stick.
      </p>
      <button type="button" className="btn btn-primary mt-5" onClick={onAdd}>
        <span aria-hidden="true">+</span> Add rule
      </button>
    </div>
  );
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <p className="py-6 text-sm text-slate-600 dark:text-slate-300">
      No rule matches that search.{" "}
      <button
        type="button"
        className="cursor-pointer text-indigo-700 underline underline-offset-2 dark:text-indigo-300"
        onClick={onClear}
      >
        Clear the filters
      </button>
    </p>
  );
}
