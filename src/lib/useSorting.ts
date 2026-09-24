"use client";

import { sortingFor, type Sorting } from "@/lib/sortName";
import { useSettings } from "@/lib/useSettings";

/**
 * The account's sorting rules, for a list page to sort with.
 *
 * Returned object is stable for as long as the language and the words to
 * skip stay the same, so a page can put it in its sort memo's dependencies:
 * the list re-sorts when settings arrive after the first render, and again
 * when the language is changed, and not otherwise.
 */
export function useSorting(): Sorting {
  const { settings } = useSettings();
  return sortingFor(settings.language, settings.sortSkipWords);
}
