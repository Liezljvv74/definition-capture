"use client";

import { useMemo, useState } from "react";

import { useListSelection, type ListSelection } from "@/lib/useListSelection";

/**
 * The bookkeeping every list page does around its rows.
 *
 * The term and phrase pages are not the same page and should not be forced
 * into one — they sort on different keys, filter on different things, and
 * their tables share almost no columns. But four small pieces were identical
 * in both, character for character apart from the noun: deriving the visible
 * ids, handing them to `useListSelection`, resolving the id being edited back
 * to an item, and turning the ids awaiting deletion into names for the
 * confirmation dialog.
 *
 * Those four are here. They are the parts where a divergence would be a bug
 * rather than a design choice — a confirmation dialog listing names in a
 * different order from the screen, or a selection that outlives a filter.
 *
 * `items` must already be filtered and sorted: the selection is intersected
 * with what is actually visible, which is what makes "delete selected" unable
 * to touch a row the reader cannot see.
 */
export function useListPage<T>(
  items: readonly T[],
  idOf: (item: T) => string,
  nameOf: (item: T) => string,
): {
  selection: ListSelection;
  /** The item the edit dialog is open on, or null. */
  editing: T | null;
  setEditingId: (id: string | null) => void;
  /** The ids the confirmation dialog is asking about, or null. */
  pendingDelete: string[] | null;
  setPendingDelete: (ids: string[] | null) => void;
  /** Their names, in on-screen order, for the dialog to list. */
  pendingNames: string[];
} {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string[] | null>(null);

  const visibleIds = useMemo(() => items.map(idOf), [items, idOf]);
  const selection = useListSelection(visibleIds);

  const editing = editingId
    ? (items.find((item) => idOf(item) === editingId) ?? null)
    : null;

  const pendingNames = useMemo(() => {
    if (!pendingDelete) return [];
    const doomed = new Set(pendingDelete);
    return items.filter((item) => doomed.has(idOf(item))).map(nameOf);
  }, [pendingDelete, items, idOf, nameOf]);

  return {
    selection,
    editing,
    setEditingId,
    pendingDelete,
    setPendingDelete,
    pendingNames,
  };
}
