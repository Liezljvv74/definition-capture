"use client";

import { useId, useState, type FormEvent } from "react";

import { CollectionPicker, FormFooter, SourceSelect } from "@/components/ItemFields";
import { RefField } from "@/components/RefField";
import { EMPTY_PHRASE_INPUT, type PhraseInput } from "@/lib/types";

type PhraseFormProps = {
  initialValue?: PhraseInput;
  submitLabel: string;
  onSubmit: (input: PhraseInput) => void;
  onCancel: () => void;
};

export function PhraseForm({
  initialValue = EMPTY_PHRASE_INPUT,
  submitLabel,
  onSubmit,
  onCancel,
}: PhraseFormProps) {
  const [value, setValue] = useState<PhraseInput>(initialValue);
  const [error, setError] = useState<string | null>(null);
  const ids = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phrase = value.phrase.trim();
    if (!phrase) {
      setError("A phrase is required.");
      return;
    }
    setError(null);
    onSubmit({
      phrase,
      literalMeaning: value.literalMeaning.trim(),
      usageExample: value.usageExample.trim(),
      collections: value.collections,
      source: value.source,
      ref: value.ref.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor={`${ids}-phrase`} className="mb-1 block text-sm font-medium">
          Phrase <span className="text-red-600 dark:text-red-400">*</span>
        </label>
        <input
          id={`${ids}-phrase`}
          className="field"
          value={value.phrase}
          autoFocus
          autoComplete="off"
          placeholder="e.g. Boil the ocean"
          onChange={(event) =>
            setValue((current) => ({ ...current, phrase: event.target.value }))
          }
        />
      </div>

      <div>
        <label htmlFor={`${ids}-literal`} className="mb-1 block text-sm font-medium">
          Literal meaning
        </label>
        <textarea
          id={`${ids}-literal`}
          className="field min-h-20 resize-y"
          value={value.literalMeaning}
          placeholder="What it actually means. Leave blank to fill in later."
          onChange={(event) =>
            setValue((current) => ({ ...current, literalMeaning: event.target.value }))
          }
        />
      </div>

      <div>
        <label htmlFor={`${ids}-usage`} className="mb-1 block text-sm font-medium">
          Usage example
        </label>
        <textarea
          id={`${ids}-usage`}
          className="field min-h-20 resize-y"
          value={value.usageExample}
          placeholder="A sentence showing it in use."
          onChange={(event) =>
            setValue((current) => ({ ...current, usageExample: event.target.value }))
          }
        />
      </div>

      <CollectionPicker
        initial={initialValue.collections}
        chosen={value.collections}
        onChange={(collections) => setValue((current) => ({ ...current, collections }))}
        hint="The same groups the words use."
      />

      <div>
        <SourceSelect
          id={`${ids}-source`}
          className="field sm:w-56"
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
          // The phrase being edited cannot usefully refer to itself.
          exclude={[initialValue.phrase, value.phrase]}
          selfKind="phrase"
        />
      </div>

      <FormFooter error={error} submitLabel={submitLabel} onCancel={onCancel} />
    </form>
  );
}
