"use client";

import { useId, useState } from "react";

import { Modal } from "@/components/Modal";
import { KIND_LABEL, type LinkTarget } from "@/lib/links";
import { suggestRefs } from "@/lib/refSuggestions";
import { LINK_CHARS } from "@/lib/rules";

/**
 * Searches every rule, verb table, word and phrase for what the selected
 * words should link to, starting from the words themselves, since they are
 * most often the name. The suggestion search the Ref field uses, so the two
 * offer the same names in the same order. A name holding `|`, `[` or `]` is
 * left out, the same characters `titleProblem` refuses in a title, because a
 * link to one would either read back as a different name (`[[a|b]]` reads as
 * the name "a" shown as "b") or end its own markup early.
 */
export function LinkToDialog({
  targets,
  words,
  selfTitle,
  onPick,
  onClose,
}: {
  targets: readonly LinkTarget[];
  words: string;
  /** The rule being read, which a link from itself would only lead back to. */
  selfTitle: string;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const inputId = useId();
  const [query, setQuery] = useState(words);
  const found = suggestRefs(targets, query, [selfTitle], undefined, "rule").filter((s) => !LINK_CHARS.test(s.name));

  return (
    <Modal title="Link to" onClose={onClose}>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium">
        Search
      </label>
      <input id={inputId} type="search" className="field" value={query} autoFocus onChange={(event) => setQuery(event.target.value)} />
      {found.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Nothing saved matches that.</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {found.map((suggestion) => (
            <li key={`${suggestion.kind}:${suggestion.name}`}>
              <button
                type="button"
                className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => onPick(suggestion.name)}
              >
                <span>{suggestion.name}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400">{KIND_LABEL[suggestion.kind]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
