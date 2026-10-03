"use client";

import { useId, useState } from "react";

import { Modal } from "@/components/Modal";
import { KIND_LABEL, type LinkTarget } from "@/lib/links";
import { suggestRefs } from "@/lib/refSuggestions";
import { searchRules } from "@/lib/ruleSearch";
import { LINK_CHARS } from "@/lib/rules";
import type { Rule } from "@/lib/types";

/**
 * Searches every rule, verb table, word and phrase for what the selected
 * words should link to, starting from the words themselves, since they are
 * most often the name. The suggestion search the Ref field uses, so the two
 * offer the same names in the same order. A name holding `|`, `[` or `]` is
 * left out, the same characters `titleProblem` refuses in a title, because a
 * link to one would either read back as a different name (`[[a|b]]` reads as
 * the name "a" shown as "b") or end its own markup early.
 *
 * Under the name matches, rules whose text mentions any of the words: a rule
 * about the selected words is often named for the concept, not the words
 * (the owner's request, 3 October 2026). Each shows where it matched.
 */
export function LinkToDialog({
  targets,
  rules,
  words,
  selfTitle,
  onPick,
  onClose,
}: {
  targets: readonly LinkTarget[];
  /** Every rule, searched by its text as well as its name. */
  rules: readonly Rule[];
  words: string;
  /** The rule being read, which a link from itself would only lead back to. */
  selfTitle: string;
  onPick: (name: string) => void;
  onClose: () => void;
}) {
  const inputId = useId();
  const [query, setQuery] = useState(words);
  const found = suggestRefs(targets, query, [selfTitle], undefined, "rule").filter((s) => !LINK_CHARS.test(s.name));
  // A rule already listed by name is not repeated below.
  const named = new Set(found.filter((s) => s.kind === "rule").map((s) => s.name));
  const mentioned = searchRules(rules, query, selfTitle).filter((match) => !named.has(match.title));

  return (
    <Modal title="Link to" onClose={onClose}>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium">
        Search
      </label>
      <input id={inputId} type="search" className="field" value={query} autoFocus onChange={(event) => setQuery(event.target.value)} />
      {found.length === 0 && mentioned.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">Nothing saved matches that.</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {found.map((suggestion) => (
            <li key={`${suggestion.kind}:${suggestion.name}`}>
              <button
                type="button"
                className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-tile-sky"
                onClick={() => onPick(suggestion.name)}
              >
                <span>{suggestion.name}</span>
                <span className="text-xs text-ink-soft">{KIND_LABEL[suggestion.kind]}</span>
              </button>
            </li>
          ))}
          {mentioned.length > 0 && (
            <li role="presentation" className="px-3 pt-3 pb-1 text-xs font-semibold tracking-wider text-ink-soft uppercase">
              Mentioned in
            </li>
          )}
          {mentioned.map((match) => (
            <li key={`text:${match.title}`}>
              <button
                type="button"
                className="w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm hover:bg-tile-sky"
                onClick={() => onPick(match.title)}
              >
                <span className="flex items-center justify-between gap-3">
                  <span>{match.title}</span>
                  <span className="text-xs text-ink-soft">{KIND_LABEL.rule}</span>
                </span>
                <span className="mt-0.5 block text-xs text-ink-soft [overflow-wrap:anywhere]">{match.snippet}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
