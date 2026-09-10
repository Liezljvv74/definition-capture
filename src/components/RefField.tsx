"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import {
  activeRefQuery,
  applyRefSuggestion,
  looksLikeUrl,
  suggestRefs,
  type RefQuery,
} from "@/lib/refSuggestions";
import { usePhrases } from "@/lib/usePhrases";
import { useTerms } from "@/lib/useTerms";

/** Matches `max-h-56` on the list below; used to decide which way it opens. */
const LIST_MAX_HEIGHT = 224;

/** The `mt-1` / `mb-1` gap between the field and the list. */
const LIST_GAP = 4;

/**
 * The Ref input, with an inline lookup over everything you have saved. Typing
 * a name offers the terms and phrases it matches; picking one writes it in as
 * `[[Name]]`. Everything else — notes, URLs, `/term?id=…`, `#anchor` — is
 * typed exactly as before, and the value handed back is always a plain string.
 *
 * The lists come from the same stores the pages read, so there is nothing here
 * to keep in step with them.
 */
type RefFieldProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  describedBy?: string;
  /** Names the form must not offer — normally whatever it is editing. */
  exclude?: readonly string[];
};

export function RefField({
  id,
  value,
  onChange,
  placeholder,
  describedBy,
  exclude,
}: RefFieldProps) {
  const { entries } = useTerms();
  const { phrases } = usePhrases();

  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  /** Set when a pick moves the caret, applied once the new value is on screen. */
  const pendingCaret = useRef<number | null>(null);

  const [query, setQuery] = useState<RefQuery | null>(null);
  const [active, setActive] = useState(0);
  const [dropUp, setDropUp] = useState(false);

  // `exclude` is rebuilt by the parent on every keystroke, so it is reduced to
  // a string the memo below can actually compare. Newline is the separator
  // because a name can hold spaces — "Boil the ocean" is one name, not three.
  const excluded = exclude?.join("\n") ?? "";

  const suggestions = useMemo(() => {
    if (!query || looksLikeUrl(query.text)) return [];
    return suggestRefs(entries, phrases, query.text, excluded ? excluded.split("\n") : []);
  }, [entries, phrases, query, excluded]);

  const isOpen = suggestions.length > 0;
  // A list that shrank under the highlight would otherwise leave it pointing
  // past the end, and Enter would insert nothing.
  const activeIndex = Math.min(active, suggestions.length - 1);

  useEffect(() => {
    const caret = pendingCaret.current;
    if (caret === null || !inputRef.current) return;
    pendingCaret.current = null;
    inputRef.current.focus();
    inputRef.current.setSelectionRange(caret, caret);
  });

  /**
   * A Ref field near the foot of a dialog would otherwise drop its list off
   * the bottom of the screen, so it opens upwards when there is no room below
   * and more room above. Re-measured on resize, and on any scroll — the
   * dialog scrolls inside its own overlay rather than moving the window,
   * which only a capturing listener sees.
   */
  useLayoutEffect(() => {
    if (!isOpen) return;

    const measure = () => {
      const input = inputRef.current;
      if (!input) return;
      const rect = input.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - LIST_GAP;
      const above = rect.top - LIST_GAP;
      setDropUp(below < LIST_MAX_HEIGHT && above > below);
    };

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [isOpen, suggestions.length]);

  function choose(index: number) {
    const suggestion = suggestions[index];
    if (!query || !suggestion) return;
    const next = applyRefSuggestion(value, query, suggestion.name);
    pendingCaret.current = next.caret;
    setQuery(null);
    onChange(next.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((current) => (current + 1) % suggestions.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((current) => (current - 1 + suggestions.length) % suggestions.length);
        break;
      case "Enter":
        // Without this the form would submit on the keypress meant to pick a
        // name out of the list.
        event.preventDefault();
        choose(activeIndex);
        break;
      case "Escape":
        // Stops the dialog reading this as a request to close: the first
        // Escape dismisses the list, a second one closes the dialog.
        event.preventDefault();
        event.stopPropagation();
        setQuery(null);
        break;
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        ref={inputRef}
        className="field"
        value={value}
        autoComplete="off"
        placeholder={placeholder}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={isOpen ? `${listId}-${activeIndex}` : undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(activeRefQuery(next, event.target.selectionStart ?? next.length));
          setActive(0);
          onChange(next);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setQuery(null)}
      />

      {isOpen && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Saved terms and phrases"
          className={`card absolute z-10 max-h-56 w-full overflow-y-auto p-1 shadow-lg ${
            dropUp ? "bottom-full mb-1" : "top-full mt-1"
          }`}
          // Keeps the field focused through the click, so blur does not close
          // the list out from under the pointer.
          onMouseDown={(event) => event.preventDefault()}
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={`${suggestion.kind}-${suggestion.name}`}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(index)}
              className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm ${
                index === activeIndex
                  ? "bg-indigo-50 text-indigo-900 dark:bg-indigo-500/15 dark:text-indigo-100"
                  : "text-slate-700 dark:text-slate-200"
              }`}
            >
              <span className="truncate">{suggestion.name}</span>
              <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {suggestion.kind === "term" ? "Term" : "Phrase"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
