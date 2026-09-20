"use client";

import { useMemo, useState } from "react";

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
import { foldName } from "@/lib/foldName";
import { deleteGrammarRules } from "@/lib/grammarRules";
import { compareText } from "@/lib/sortName";
import type { GrammarRule } from "@/lib/types";
import { useGrammarRules } from "@/lib/useGrammarRules";
import { useListPage } from "@/lib/useListPage";
import { type ListSelection } from "@/lib/useListSelection";
import { usePhrases } from "@/lib/usePhrases";
import { useTerms } from "@/lib/useTerms";
import { useWideScreen } from "@/lib/useWideScreen";

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
  const { rules, loaded } = useGrammarRules();
  const { entries } = useTerms();
  const { phrases } = usePhrases();
  const wide = useWideScreen();

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

  const linkIndex = useMemo(() => buildLinkIndex(entries, phrases), [entries, phrases]);
  const knownCategories = useMemo(
    () => categoryOptions.filter(Boolean),
    [categoryOptions],
  );
  const isFiltered = query.trim() !== "" || category !== "";

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
            <div className="mb-3 flex flex-wrap items-center gap-2">
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

            {/* One layout once the viewport is known, both until then — see
                `useWideScreen`. */}
            {wide !== false && (
              <RuleTable
                rules={visible}
                linkIndex={linkIndex}
                selection={selection}
                onSelectCategory={setCategory}
                onEdit={setEditingId}
                onDelete={(id) => setPendingDelete([id])}
              />
            )}
            {wide !== true && (
              <RuleCards
                rules={visible}
                linkIndex={linkIndex}
                selection={selection}
                onSelectCategory={setCategory}
                onEdit={setEditingId}
                onDelete={(id) => setPendingDelete([id])}
              />
            )}

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
        <AddGrammarRuleDialog
          knownCategories={knownCategories}
          onClose={() => setIsAdding(false)}
        />
      )}

      {editing && (
        <EditGrammarRuleDialog
          rule={editing}
          knownCategories={knownCategories}
          onClose={() => setEditingId(null)}
        />
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

type ListProps = {
  rules: GrammarRule[];
  linkIndex: LinkIndex;
  selection: ListSelection;
  onSelectCategory: (name: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
};

function RuleTable({
  rules,
  linkIndex,
  selection,
  onSelectCategory,
  onEdit,
  onDelete,
}: ListProps) {
  return (
    <div className="card hidden overflow-hidden md:block">
      <table className="w-full table-fixed border-collapse text-sm">
        <thead className="bg-slate-50 text-left dark:bg-slate-950/50">
          <tr>
            <th scope="col" className="w-10 px-3 py-2.5">
              <SelectAllCheckbox
                checked={selection.allSelected}
                indeterminate={selection.partiallySelected}
                onChange={selection.toggleAll}
                label="Select every rule shown"
              />
            </th>
            <th scope="col" className="w-[22%] px-3 py-2.5 font-semibold">
              Title
            </th>
            <th scope="col" className="w-[12%] px-3 py-2.5 font-semibold">
              Category
            </th>
            <th scope="col" className="px-3 py-2.5 font-semibold">
              Explanation
            </th>
            <th scope="col" className="w-[22%] px-3 py-2.5 font-semibold">
              Examples
            </th>
            <th scope="col" className="w-[16%] px-3 py-2.5 font-semibold">
              Ref
            </th>
            <th scope="col" className="w-12 px-3 py-2.5">
              <span className="sr-only">Delete</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => (
            <tr
              key={rule.id}
              className="border-t border-slate-200 align-top dark:border-slate-800"
            >
              <td className="px-3 py-2.5">
                <SelectRowCheckbox
                  checked={selection.isSelected(rule.id)}
                  onChange={() => selection.toggle(rule.id)}
                  label={rule.title}
                />
              </td>
              <td className="px-3 py-2.5">
                <button
                  type="button"
                  className="cursor-pointer text-left font-medium text-indigo-700 hover:underline dark:text-indigo-300"
                  onClick={() => onEdit(rule.id)}
                >
                  {rule.title}
                </button>
              </td>
              <td className="px-3 py-2.5">
                {rule.category ? (
                  <button
                    type="button"
                    className="cursor-pointer"
                    title={`Show only ${rule.category}`}
                    onClick={() => onSelectCategory(rule.category)}
                  >
                    <CategoryBadge name={rule.category} />
                  </button>
                ) : (
                  <Dash />
                )}
              </td>
              <td className="px-3 py-2.5 whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                {rule.explanation || <Dash />}
              </td>
              <td className="px-3 py-2.5 whitespace-pre-wrap text-slate-700 italic dark:text-slate-300">
                {rule.examples || <Dash />}
              </td>
              <td className="px-3 py-2.5 break-words text-slate-700 dark:text-slate-300">
                {rule.ref ? <RefText value={rule.ref} linkIndex={linkIndex} /> : <Dash />}
              </td>
              <td className="px-3 py-2.5 text-right">
                <RowDeleteButton label={rule.title} onClick={() => onDelete(rule.id)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RuleCards({
  rules,
  linkIndex,
  selection,
  onSelectCategory,
  onEdit,
  onDelete,
}: ListProps) {
  return (
    <div className="md:hidden">
      {rules.length > 0 && (
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

      <ul className="space-y-2">
        {rules.map((rule) => (
          <li key={rule.id} className="card p-4">
            <div className="flex items-start gap-2.5">
              <SelectRowCheckbox
                checked={selection.isSelected(rule.id)}
                onChange={() => selection.toggle(rule.id)}
                label={rule.title}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    className="cursor-pointer text-left font-medium text-indigo-700 hover:underline dark:text-indigo-300"
                    onClick={() => onEdit(rule.id)}
                  >
                    <h2>{rule.title}</h2>
                  </button>
                  <RowDeleteButton
                    label={rule.title}
                    onClick={() => onDelete(rule.id)}
                    className="shrink-0"
                  />
                </div>

                {rule.category && (
                  <button
                    type="button"
                    className="mt-1.5 cursor-pointer"
                    title={`Show only ${rule.category}`}
                    onClick={() => onSelectCategory(rule.category)}
                  >
                    <CategoryBadge name={rule.category} />
                  </button>
                )}

                {rule.explanation && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                    {rule.explanation}
                  </p>
                )}

                {rule.examples && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 italic dark:text-slate-300">
                    {rule.examples}
                  </p>
                )}

                {rule.ref && (
                  <p className="mt-2 text-sm break-words text-slate-600 dark:text-slate-400">
                    <RefText value={rule.ref} linkIndex={linkIndex} />
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** An em dash standing in for a field that has nothing in it. */
function Dash() {
  return <span className="text-slate-400 dark:text-slate-500">—</span>;
}

function EmptyGrammar({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="card mx-auto max-w-xl p-8 text-center">
      <div aria-hidden="true" className="mb-3 text-4xl">
        📐
      </div>
      <h2 className="text-lg font-semibold">No grammar rules yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-300">
        A rule is the thing you keep having to look up — which case follows a
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
