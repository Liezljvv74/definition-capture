"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * Row selection for a list page, shared by the word list and the phrase list so
 * every list in the app selects and deletes the same way.
 *
 * The hook is handed the ids that are on screen right now (already searched,
 * filtered, and sorted). Selection is intersected with that list on every
 * render, which means a row that the user filters away — or that a delete has
 * just removed — silently leaves the selection. "Delete selected" can therefore
 * only ever delete rows the user can actually see, which is the whole point.
 */
export type ListSelection = {
  /** Selected ids, in the order they appear on screen. */
  selectedIds: string[];
  count: number;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
  /** True when every visible row is selected (and there is at least one). */
  allSelected: boolean;
  /** True when some, but not all, visible rows are selected. */
  partiallySelected: boolean;
  /** Selects every visible row, or clears them if they are all selected. */
  toggleAll: () => void;
  clear: () => void;
};

export function useListSelection(visibleIds: readonly string[]): ListSelection {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  const selectedIds = useMemo(
    () => visibleIds.filter((id) => selected.has(id)),
    [visibleIds, selected],
  );

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  const allSelected = visibleIds.length > 0 && selectedIds.length === visibleIds.length;

  const toggleAll = useCallback(() => {
    setSelected((current) => {
      const visible = new Set(visibleIds);
      const everySelected =
        visibleIds.length > 0 && visibleIds.every((id) => current.has(id));
      if (everySelected) {
        // Clear only the visible rows; a selection made under another filter stays.
        const next = new Set(current);
        for (const id of visible) next.delete(id);
        return next;
      }
      return new Set([...current, ...visible]);
    });
  }, [visibleIds]);

  const clear = useCallback(() => setSelected(new Set()), []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  /**
   * Memoised, and the object itself matters as much as its parts.
   *
   * Every callback above is already stable, and then a fresh object literal
   * wrapped them on each render, so anything downstream comparing this prop
   * saw a new value every time. Nothing measurable today, because no row is
   * memoised yet — but it is exactly the trap that makes someone add `memo`
   * to a row, see no improvement, and conclude memoising does not help here.
   */
  return useMemo(
    () => ({
      selectedIds,
      count: selectedIds.length,
      isSelected,
      toggle,
      allSelected,
      partiallySelected: selectedIds.length > 0 && !allSelected,
      toggleAll,
      clear,
    }),
    [selectedIds, isSelected, toggle, allSelected, toggleAll, clear],
  );
}
