"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { Modal } from "@/components/Modal";
import { applyImport, parseBackup, type BackupContents, type ImportResult } from "@/lib/backup";
import {
  downloadExcelBackup,
  downloadJsonBackup,
  readFileAsText,
} from "@/lib/backupFile";
import type { ImportMode } from "@/lib/browserStore";
import { useGlossary } from "@/lib/useGlossary";
import { usePhrases } from "@/lib/usePhrases";

type Preview = {
  fileName: string;
  contents: BackupContents;
  /** How many of the file's items already exist here, by name. */
  matchingTerms: number;
  matchingPhrases: number;
};

type ExportState =
  | { step: "idle" }
  | { step: "choosing" }
  | { step: "working" }
  | { step: "failed"; message: string };

type ImportState =
  | { step: "idle" }
  | { step: "error"; message: string }
  | { step: "preview"; preview: Preview }
  | { step: "confirmReplace"; preview: Preview }
  | { step: "done"; result: ImportResult; mode: ImportMode };

export function BackupButtons() {
  const { entries } = useGlossary();
  const { phrases } = usePhrases();
  const fileInput = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ImportState>({ step: "idle" });
  const [exportState, setExportState] = useState<ExportState>({ step: "idle" });
  const [mode, setMode] = useState<ImportMode>("skip");
  const [justExported, setJustExported] = useState(false);

  const savedCount = entries.length + phrases.length;

  useEffect(() => {
    if (!justExported) return;
    const timer = window.setTimeout(() => setJustExported(false), 2000);
    return () => window.clearTimeout(timer);
  }, [justExported]);

  async function runExport(format: "json" | "xlsx") {
    setExportState({ step: "working" });
    try {
      if (format === "json") downloadJsonBackup();
      // The workbook is built asynchronously, so failures land here rather
      // than leaving the dialog open with nothing happening.
      else await downloadExcelBackup();
      setExportState({ step: "idle" });
      setJustExported(true);
    } catch {
      setExportState({
        step: "failed",
        message: "The export could not be created. Please try again.",
      });
    }
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

    const savedTerms = new Set(entries.map((entry) => entry.term.toLocaleLowerCase()));
    const savedPhrases = new Set(phrases.map((phrase) => phrase.phrase.toLocaleLowerCase()));

    setMode("skip");
    setState({
      step: "preview",
      preview: {
        fileName: file.name,
        contents: { entries: parsed.entries, phrases: parsed.phrases, unreadable: parsed.unreadable },
        matchingTerms: parsed.entries.filter((entry) =>
          savedTerms.has(entry.term.toLocaleLowerCase()),
        ).length,
        matchingPhrases: parsed.phrases.filter((phrase) =>
          savedPhrases.has(phrase.phrase.toLocaleLowerCase()),
        ).length,
      },
    });
  }

  const close = () => setState({ step: "idle" });

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => setExportState({ step: "choosing" })}
        disabled={savedCount === 0}
        title={
          savedCount === 0
            ? "Save something before exporting"
            : "Download all terms and phrases as Excel or JSON"
        }
      >
        {justExported ? "Exported ✓" : "Export"}
      </button>

      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => fileInput.current?.click()}
        title="Restore terms and phrases from a JSON backup"
      >
        Import
      </button>

      {exportState.step !== "idle" && (
        <Modal
          title="Export"
          onClose={() =>
            exportState.step === "working" ? undefined : setExportState({ step: "idle" })
          }
        >
          {exportState.step === "failed" ? (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {exportState.message}
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setExportState({ step: "choosing" })}
                >
                  Back
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {savedCount} {savedCount === 1 ? "item" : "items"} across your terms and
                phrases. Which format?
              </p>

              <ExportChoice
                title="Excel workbook (.xlsx)"
                detail="Terms and Phrases on separate sheets. Best for reading, sorting, or printing outside the app."
                disabled={exportState.step === "working"}
                onClick={() => runExport("xlsx")}
              />
              <ExportChoice
                title="JSON backup (.json)"
                detail="The complete backup. This is the only format Import can read back in."
                disabled={exportState.step === "working"}
                onClick={() => runExport("json")}
              />

              {exportState.step === "working" && (
                <p className="text-sm text-slate-500 dark:text-slate-400">Preparing…</p>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={exportState.step === "working"}
                  onClick={() => setExportState({ step: "idle" })}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

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
          savedTerms={entries.length}
          savedPhrases={phrases.length}
          mode={mode}
          onModeChange={setMode}
          onCancel={close}
          onConfirm={() =>
            mode === "replace"
              ? setState({ step: "confirmReplace", preview: state.preview })
              : setState({
                  step: "done",
                  result: applyImport(state.preview.contents, mode),
                  mode,
                })
          }
        />
      )}

      {state.step === "confirmReplace" && (
        <Modal title="Replace what you have saved?" onClose={close}>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            This deletes the {entries.length} {entries.length === 1 ? "term" : "terms"} you have
            saved and restores the {state.preview.contents.entries.length} from the backup
            instead.
            {state.preview.contents.phrases.length > 0
              ? ` Your ${phrases.length} saved ${
                  phrases.length === 1 ? "phrase" : "phrases"
                } are replaced by the ${state.preview.contents.phrases.length} in the file.`
              : " This file carries no phrases, so your phrase list is left alone."}{" "}
            It cannot be undone.
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
              onClick={() =>
                setState({
                  step: "done",
                  result: applyImport(state.preview.contents, "replace"),
                  mode: "replace",
                })
              }
            >
              Yes, replace
            </button>
          </div>
        </Modal>
      )}

      {state.step === "done" && (
        <Modal title="Import finished" onClose={close}>
          <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300">
            <ResultBlock label="Terms" counts={state.result.terms} mode={state.mode} />
            <ResultBlock label="Phrases" counts={state.result.phrases} mode={state.mode} />
          </div>
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

function ExportChoice({
  title,
  detail,
  disabled,
  onClick,
}: {
  title: string;
  detail: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full cursor-pointer rounded-lg border border-slate-200 p-3 text-left transition hover:border-indigo-400 hover:bg-indigo-50/50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:hover:border-indigo-500/60 dark:hover:bg-indigo-500/10"
    >
      <span className="block text-sm font-medium">{title}</span>
      <span className="block text-xs text-slate-500 dark:text-slate-400">{detail}</span>
    </button>
  );
}

function ResultBlock({
  label,
  counts,
  mode,
}: {
  label: string;
  counts: { added: number; updated: number; skipped: number };
  mode: ImportMode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {label}
      </p>
      <ul className="mt-1 space-y-0.5">
        <li>
          <strong className="font-semibold">{counts.added}</strong>{" "}
          {mode === "replace" ? "restored" : "added"}
        </li>
        {mode !== "replace" && (
          <>
            <li>
              <strong className="font-semibold">{counts.updated}</strong> updated
            </li>
            <li>
              <strong className="font-semibold">{counts.skipped}</strong> already saved, left
              alone
            </li>
          </>
        )}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- preview  */

const MODE_OPTIONS: { value: ImportMode; label: string; hint: string }[] = [
  {
    value: "skip",
    label: "Add only what I don't have",
    hint: "Nothing already saved is touched.",
  },
  {
    value: "update",
    label: "Add new and update matching",
    hint: "The backup overwrites what you have.",
  },
  {
    value: "replace",
    label: "Replace everything with this backup",
    hint: "What is saved now is deleted first.",
  },
];

function ImportPreview({
  preview,
  savedTerms,
  savedPhrases,
  mode,
  onModeChange,
  onCancel,
  onConfirm,
}: {
  preview: Preview;
  savedTerms: number;
  savedPhrases: number;
  mode: ImportMode;
  onModeChange: (mode: ImportMode) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const terms = preview.contents.entries.length;
  const phrases = preview.contents.phrases.length;

  return (
    <Modal title="Import a backup" onClose={onCancel}>
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/50">
          <p className="font-medium break-all">{preview.fileName}</p>
          <ul className="mt-1 space-y-0.5 text-slate-600 dark:text-slate-300">
            <li>
              {terms} {terms === 1 ? "term" : "terms"} — {terms - preview.matchingTerms} new to
              you, {preview.matchingTerms} of your {savedTerms} already saved.
            </li>
            <li>
              {phrases} {phrases === 1 ? "phrase" : "phrases"} —{" "}
              {phrases - preview.matchingPhrases} new to you, {preview.matchingPhrases} of your{" "}
              {savedPhrases} already saved.
            </li>
          </ul>
          {preview.contents.unreadable > 0 && (
            <p className="mt-1 text-amber-700 dark:text-amber-300">
              {preview.contents.unreadable}{" "}
              {preview.contents.unreadable === 1 ? "row was" : "rows were"} not readable and
              will be ignored.
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
            {mode === "replace" ? "Replace…" : "Import"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
