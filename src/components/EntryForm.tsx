"use client";

import { useId, useState, type ClipboardEvent, type FormEvent } from "react";

import { CollectionPicker, FormFooter, SourceSelect } from "@/components/ItemFields";
import { RefField } from "@/components/RefField";
import { splitWordAndDefinition } from "@/lib/parseWord";
import { EMPTY_ENTRY_INPUT, type EntryInput } from "@/lib/types";
import { VerbTableControl } from "@/components/VerbTableControl";

type EntryFormProps = {
  initialValue?: EntryInput;
  submitLabel: string;
  onSubmit: (input: EntryInput) => void;
  onCancel: () => void;
  /** Only the "add" form splits pasted "word: definition" text. */
  autoSplit?: boolean;
  /**
   * The saved word this form is editing. Only an entry that exists can
   * have a conjugation table hung off it, so the add form passes nothing
   * and the control does not appear there.
   */
  verbTableFor?: string;
};

export function EntryForm({
  initialValue = EMPTY_ENTRY_INPUT,
  submitLabel,
  onSubmit,
  onCancel,
  autoSplit = false,
  verbTableFor,
}: EntryFormProps) {
  const [value, setValue] = useState<EntryInput>(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [didSplit, setDidSplit] = useState(false);
  const ids = useId();

  /**
   * Split "word: definition" into both fields. Only fills Definition when it is
   * still empty, so text already typed there is never overwritten.
   */
  function tryAutoSplit(text: string): boolean {
    if (!autoSplit || value.definition.trim()) return false;
    const split = splitWordAndDefinition(text);
    if (!split) return false;
    setValue((current) => ({ ...current, ...split }));
    setDidSplit(true);
    return true;
  }

  function handleWordPaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text");
    const input = event.currentTarget;
    // Only intercept a paste that replaces the whole field, so a paste into the
    // middle of an existing word behaves normally.
    const replacesAll =
      input.selectionStart === 0 && input.selectionEnd === input.value.length;
    if (!replacesAll) return;
    if (tryAutoSplit(pasted)) event.preventDefault();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const word = value.word.trim();
    if (!word) {
      setError("A word is required.");
      return;
    }
    setError(null);
    onSubmit({ ...value, word, definition: value.definition.trim() });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor={`${ids}-word`} className="mb-1 block text-sm font-medium">
          Word <span className="text-red-600 dark:text-red-400">*</span>
        </label>
        <input
          id={`${ids}-word`}
          className="field"
          value={value.word}
          autoFocus
          autoComplete="off"
          placeholder="e.g. Idempotent"
          onPaste={handleWordPaste}
          onChange={(event) => {
            setDidSplit(false);
            setValue((current) => ({ ...current, word: event.target.value }));
          }}
          onBlur={(event) => tryAutoSplit(event.target.value)}
          aria-describedby={`${ids}-word-hint`}
        />
        <p id={`${ids}-word-hint`} className="mt-1 text-xs text-ink-soft">
          {autoSplit
            ? didSplit
              ? "Split into Word and Definition. Edit either field if that isn't right."
              : "Paste \u201cword: definition\u201d or \u201cword - definition\u201d and it splits itself."
            : "The word or concept you want to remember."}
        </p>
      </div>

      <div>
        <label htmlFor={`${ids}-definition`} className="mb-1 block text-sm font-medium">
          Definition
        </label>
        <textarea
          id={`${ids}-definition`}
          className="field min-h-28 resize-y"
          value={value.definition}
          placeholder="Leave blank to come back and fill it in later."
          onChange={(event) =>
            setValue((current) => ({ ...current, definition: event.target.value }))
          }
        />
      </div>

      <CollectionPicker
        initial={initialValue.collections}
        chosen={value.collections}
        onChange={(collections) => setValue((current) => ({ ...current, collections }))}
        hint="Groups words that belong together."
      />

      <div className="grid gap-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
        <div>
          <SourceSelect
            id={`${ids}-source`}
            initial={initialValue.source}
            value={value.source}
            onChange={(source) => setValue((current) => ({ ...current, source }))}
          />
        </div>

        <div>
          <label htmlFor={`${ids}-ref`} className="mb-1 block text-sm font-medium">
            Ref
          </label>
          <RefField
            id={`${ids}-ref`}
            value={value.ref}
            placeholder="Note, link or saved word/phrase"
            onChange={(ref) => setValue((current) => ({ ...current, ref }))}
            // A word referring to itself is a link back to the page you are
            // already on. Both names are excluded so a rename mid-edit cannot
            // make the old one selectable again.
            exclude={[initialValue.word, value.word]}
            selfKind="word"
          />
        </div>
      </div>

      {verbTableFor && <VerbTableControl verb={verbTableFor} />}

      <FormFooter error={error} submitLabel={submitLabel} onCancel={onCancel} />
    </form>
  );
}
