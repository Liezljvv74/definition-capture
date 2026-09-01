"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { Modal } from "@/components/Modal";
import { downloadBackup, readFileAsText } from "@/lib/backupFile";
import {
  importEntries,
  parseBackup,
  type ImportMode,
  type ImportResult,
} from "@/lib/storage";
import type { Entry } from "@/lib/types";
import { useGlossary } from "@/lib/useGlossary";

type Preview = {
  fileName: string;
  entries: Entry[];
  /** Rows in the file that were not readable as entries. */
  unreadable: number;
  /** How many of the file's terms already exist in the glossary. */
  matching: number;
};

type ImportState =
  | { step: "idle" }
  | { step: "error"; message: string }
  | { step: "preview"; preview: Preview }
  | { step: "confirmReplace"; preview: Preview }
  | { step: "done"; result: ImportResult; mode: ImportMode };

export function BackupButtons() {
  const { entries } = useGlossary();
  const fileInput = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ImportState>({ step: "idle" });
  const [mode, setMode] = useState<ImportMode>("skip");
  const [justExported, setJustExported] = useState(false);

  useEffect(() => {
    if (!justExported) return;
    const timer = window.setTimeout(() => setJustExported(false), 2000);
    return () => window.clearTimeout(timer);
  }, [justExported]);

  function handleExport() {
    downloadBackup();
    setJustExported(true);
  }

  async function handleFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset immediately so choosing the same file twice still fires a change.
    event.target.value = "";
    if (!file) return;

    let text: string;
    try {
      text = await readFileAsText(file);
    } catch {
      setState({ step: "error", message: "That file could not be read." });
      return;
    }

    const parsed = parseBackup(text);
    if (!parsed.ok) {
      setState({ step: "error", message: parsed.error });
      return;
    }

    const existingTerms = new Set(entries.map((entry) => entry.term.toLocaleLowerCase()));
    const matching = parsed.entries.filter((entry) =>
      existingTerms.has(entry.term.toLocaleLowerCase()),
    ).length;

    setMode("skip");
    setState({
      step: "preview",
      preview: {
        fileName: file.name,
        entries: parsed.entries,
        unreadable: parsed.unreadable,
        matching,
      },
    });
  }

  function runImport(preview: Preview, chosen: ImportMode) {
    const result = importEntries(preview.entries, chosen);
    setState({ step: "done", result, mode: chosen });
  }

  const close = () => setState({ step: "idle" });

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={handleExport}
        disabled={entries.length === 0}
        title={
          entries.length === 0
            ? "Add a term before exporting a backup"
            : "Download all terms as a JSON backup"
        }
      >
        {justExported ? "Exported ✓" : "Export"}
      </button>

      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => fileInput.current?.click()}
        title="Restore terms from a JSON backup"
      >
        Import
      </button>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFileChosen}
      />

      {state.step === "error" && (
        <Modal title="That backup could not be imported" onClose={close}>
          <p className="text-sm text-slate-600 dark:text-slate-300">{state.message}</p>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            Choose a file that was created by the Export button.
          </p>
          <div className="mt-5 flex justify-end">
            <button type="button" className="btn btn-secondary" onClick={close}>
              Close
            </button>
          </div>
        </Modal>
      )}

      {state.step === "preview" && (
        <ImportPreview
          preview={state.preview}
          currentCount={entries.length}
          mode={mode}
          onModeChange={setMode}
          onCancel={close}
          onConfirm={() =>
            mode === "replace"
              ? setState({ step: "confirmReplace", preview: state.preview })
              : runImport(state.preview, mode)
          }
        />
      )}

      {state.step === "confirmReplace" && (
        <Modal title="Replace the whole glossary?" onClose={close}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This deletes all {entries.length}{" "}
            {entries.length === 1 ? "term" : "terms"} currently saved and restores the{" "}
            {state.preview.entries.length} from the backup instead. It cannot be undone.
          </p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setState({ step: "preview", preview: state.preview })}
            >
              Go back
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => runImport(state.preview, "replace")}
            >
              Yes, replace everything
            </button>
          </div>
        </Modal>
      )}

      {state.step === "done" && (
        <Modal title="Import finished" onClose={close}>
          <ul className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
            <li>
              <strong className="font-semibold">{state.result.added}</strong>{" "}
              {state.mode === "replace" ? "terms restored" : "new terms added"}
            </li>
            {state.mode !== "replace" && (
              <>
                <li>
                  <strong className="font-semibold">{state.result.updated}</strong> existing
                  terms updated
                </li>
                <li>
                  <strong className="font-semibold">{state.result.skipped}</strong> already in
                  your glossary, left alone
                </li>
              </>
            )}
          </ul>
          <div className="mt-5 flex justify-end">
            <button type="button" className="btn btn-primary" onClick={close}>
              Done
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- preview  */

const MODE_OPTIONS: { value: ImportMode; label: string; hint: string }[] = [
  {
    value: "skip",
    label: "Add only the terms I don't have",
    hint: "Nothing already in your glossary is touched.",
  },
  {
    value: "update",
    label: "Add new terms and update matching ones",
    hint: "Definitions in the backup overwrite what you have.",
  },
  {
    value: "replace",
    label: "Replace my whole glossary with this backup",
    hint: "Everything currently saved is deleted first.",
  },
];

function ImportPreview({
  preview,
  currentCount,
  mode,
  onModeChange,
  onCancel,
  onConfirm,
}: {
  preview: Preview;
  currentCount: number;
  mode: ImportMode;
  onModeChange: (mode: ImportMode) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const total = preview.entries.length;
  const fresh = total - preview.matching;

  return (
    <Modal title="Import a backup" onClose={onCancel}>
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/50">
          <p className="font-medium break-all">{preview.fileName}</p>
          <p className="mt-1 text-slate-600 dark:text-slate-300">
            {total} {total === 1 ? "term" : "terms"} in this file — {fresh} new to you,{" "}
            {preview.matching} already in your glossary of {currentCount}.
          </p>
          {preview.unreadable > 0 && (
            <p className="mt-1 text-amber-700 dark:text-amber-300">
              {preview.unreadable} {preview.unreadable === 1 ? "row was" : "rows were"} not
              readable and will be ignored.
            </p>
          )}
        </div>

        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">What should happen?</legend>
          {MODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition ${
                mode === option.value
                  ? "border-indigo-500 bg-indigo-50/60 dark:border-indigo-400 dark:bg-indigo-500/10"
                  : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
              }`}
            >
              <input
                type="radio"
                name="import-mode"
                className="mt-0.5 size-4 accent-indigo-600"
                value={option.value}
                checked={mode === option.value}
                onChange={() => onModeChange(option.value)}
              />
              <span>
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {option.hint}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${mode === "replace" ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
          >
            {mode === "replace" ? "Replace glossary…" : "Import"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
