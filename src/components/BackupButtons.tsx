"use client";

import { usePathname } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";

import { Modal } from "@/components/Modal";
import {
  applyImport,
  leavesPhrasesAlone,
  leavesTermsAlone,
  leavesVerbTablesAlone,
  parseBackup,
  restoresSettings,
  type BackupContents,
  type BackupScope,
  type ImportResult,
} from "@/lib/backup";
import {
  downloadExcelBackup,
  downloadJsonBackup,
  type ExportFormat,
  type ExportSummary,
  readFileAsText,
} from "@/lib/backupFile";
import {
  chooseExportFolder,
  clearExportFolder,
  ExportFolderError,
} from "@/lib/exportFolder";
import { foldName } from "@/lib/foldName";
import type { ImportMode } from "@/lib/types";
import { useTerms } from "@/lib/useTerms";
import { usePhrases } from "@/lib/usePhrases";
import { useVerbTables } from "@/lib/useVerbTables";

type Preview = {
  fileName: string;
  contents: BackupContents;
  /** How many of the file's items already exist here, by name. */
  matchingTerms: number;
  matchingPhrases: number;
  matchingVerbTables: number;
};

type ExportState =
  | { step: "idle" }
  | { step: "choosing" }
  | { step: "working" }
  | { step: "failed"; message: string }
  /** Written. Says where, which is the one thing the reader cannot see. */
  | { step: "done"; summary: ExportSummary }
  /** The chosen folder let us down. Keeps the format so it can be retried. */
  | { step: "folderFailed"; message: string; format: ExportFormat };

type ImportState =
  | { step: "idle" }
  | { step: "error"; message: string }
  | { step: "preview"; preview: Preview }
  | { step: "confirmReplace"; preview: Preview }
  | { step: "done"; result: ImportResult; mode: ImportMode };

export function BackupButtons() {
  const { entries } = useTerms();
  const { phrases } = usePhrases();
  const { tables } = useVerbTables();
  const fileInput = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ImportState>({ step: "idle" });
  const [exportState, setExportState] = useState<ExportState>({ step: "idle" });
  const [scope, setScope] = useState<BackupScope>("all");
  const [mode, setMode] = useState<ImportMode>("skip");

  // Which list the page you are on is showing, for the "only this page" option.
  // `/phrase` (one phrase) counts as the phrase list just as `/phrases` does,
  // which is why this matches the singular prefix — the same test MainNav uses
  // to decide which tab to highlight. Everything else means the term list, and
  // these buttons only appear on the four pages where that is true: the two
  // lists and the two detail pages.
  const pathname = usePathname();
  const activeList: "terms" | "phrases" = pathname.startsWith("/phrase")
    ? "phrases"
    : "terms";
  const activeLabel = activeList === "phrases" ? "Phrases" : "Terms";

  // "Everything" means every list, conjugation tables included. They have no
  // "only this page" option because these buttons never appear on the verbs
  // page — but leaving them out of the total was how an export that claimed to
  // be everything quietly wasn't.
  const savedCount = entries.length + phrases.length + tables.length;
  const scopedCount =
    scope === "terms"
      ? entries.length
      : scope === "phrases"
        ? phrases.length
        : scope === "verbs"
          ? tables.length
          : savedCount;

  async function runExport(format: ExportFormat) {
    setExportState({ step: "working" });
    try {
      // Both formats are built and written asynchronously, so a failure
      // lands here rather than leaving the dialog open with nothing
      // happening.
      const summary =
        format === "json"
          ? await downloadJsonBackup(scope)
          : await downloadExcelBackup(scope);
      // Not closed on success. `exportFolder.ts` argues that sending a backup
      // somewhere unexpected is worse than an error, and until now the folder
      // it resolved was computed and thrown away — the reader got a tick and
      // no idea where the file went.
      setExportState({ step: "done", summary });
    } catch (cause) {
      // A folder problem is worth its own screen: the file is fine, it is
      // the destination that is not, and that is something the reader can
      // fix without leaving the dialog.
      if (cause instanceof ExportFolderError) {
        setExportState({ step: "folderFailed", message: cause.message, format });
        return;
      }
      setExportState({
        step: "failed",
        message: "The export could not be created. Please try again.",
      });
    }
  }

  /** Pick a new folder from the failure screen, then finish the export. */
  async function retryInNewFolder(format: ExportFormat) {
    try {
      if (await chooseExportFolder()) await runExport(format);
    } catch (cause) {
      setExportState({
        step: "folderFailed",
        message:
          cause instanceof ExportFolderError
            ? cause.message
            : "That folder could not be opened. Please try another.",
        format,
      });
    }
  }

  /** Give up on the folder for this export and let the browser take it. */
  async function retryInDownloads(format: ExportFormat) {
    await clearExportFolder();
    await runExport(format);
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

    const savedTerms = new Set(entries.map((entry) => foldName(entry.term)));
    const savedPhrases = new Set(phrases.map((phrase) => foldName(phrase.phrase)));
    const savedVerbs = new Set(tables.map((table) => foldName(table.verb)));

    setMode("skip");
    setState({
      step: "preview",
      preview: {
        fileName: file.name,
        contents: {
          entries: parsed.entries,
          phrases: parsed.phrases,
          verbTables: parsed.verbTables,
          settings: parsed.settings,
          unreadable: parsed.unreadable,
        },
        matchingTerms: parsed.entries.filter((entry) =>
          savedTerms.has(foldName(entry.term)),
        ).length,
        matchingPhrases: parsed.phrases.filter((phrase) =>
          savedPhrases.has(foldName(phrase.phrase)),
        ).length,
        matchingVerbTables: parsed.verbTables.filter((table) =>
          savedVerbs.has(foldName(table.verb)),
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
        onClick={() => {
          setScope("all");
          setExportState({ step: "choosing" });
        }}
        disabled={savedCount === 0}
        title={
          savedCount === 0
            ? "Save something before exporting"
            : "Download your terms, phrases, and verb tables as Excel or JSON"
        }
      >
        Export
      </button>

      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => fileInput.current?.click()}
        title="Restore terms, phrases, and verb tables from a JSON backup"
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
          {exportState.step === "done" ? (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Saved{" "}
                <span className="font-medium break-all">
                  {exportState.summary.fileName}
                </span>{" "}
                {exportState.summary.folder === null
                  ? "to your browser’s download folder"
                  : `to ${exportState.summary.folder}`}
                .
              </p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {exportState.summary.count}{" "}
                {exportState.summary.count === 1 ? "item" : "items"} written.
              </p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setExportState({ step: "idle" })}
                >
                  Done
                </button>
              </div>
            </>
          ) : exportState.step === "folderFailed" ? (
            <>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {exportState.message}
              </p>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                Nothing was saved. Choose another folder and the export will
                finish there, or send this one to your browser&rsquo;s download
                folder.
              </p>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setExportState({ step: "idle" })}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void retryInDownloads(exportState.format)}
                >
                  Use the download folder
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void retryInNewFolder(exportState.format)}
                >
                  Choose another folder
                </button>
              </div>
            </>
          ) : exportState.step === "failed" ? (
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
            <div className="space-y-4">
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium">What to export</legend>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <ScopeChoice
                    label="Everything"
                    detail={`${savedCount} across all lists`}
                    checked={scope === "all"}
                    disabled={exportState.step === "working"}
                    onSelect={() => setScope("all")}
                  />
                  <ScopeChoice
                    label={`Only this page (${activeLabel})`}
                    detail={`${
                      activeList === "phrases" ? phrases.length : entries.length
                    } ${activeList === "phrases" ? "phrases" : "terms"}`}
                    checked={scope === activeList}
                    disabled={exportState.step === "working"}
                    onSelect={() => setScope(activeList)}
                  />
                </div>
              </fieldset>

              <p className="text-sm text-slate-600 dark:text-slate-300">
                {scopedCount} {scopedCount === 1 ? "item" : "items"} selected. Which format?
              </p>

              <ExportChoice
                title="Excel workbook (.xlsx)"
                detail={
                  scope === "all"
                    ? "Terms, Phrases, and Verb tables on separate sheets. Best for reading, sorting, or printing outside the app."
                    : `One sheet of ${scope}. Best for reading, sorting, or printing outside the app.`
                }
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
          savedVerbTables={tables.length}
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
            This cannot be undone.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <ReplaceLine
              label="Terms"
              saved={entries.length}
              incoming={state.preview.contents.entries.length}
              untouched={leavesTermsAlone(state.preview.contents, "replace")}
            />
            <ReplaceLine
              label="Phrases"
              saved={phrases.length}
              incoming={state.preview.contents.phrases.length}
              untouched={leavesPhrasesAlone(state.preview.contents, "replace")}
            />
            <ReplaceLine
              label="Verb tables"
              saved={tables.length}
              incoming={state.preview.contents.verbTables.length}
              untouched={leavesVerbTablesAlone(state.preview.contents, "replace")}
            />
            <li className="flex flex-wrap gap-x-1.5">
              <span className="font-medium">Settings:</span>
              {restoresSettings(state.preview.contents, "replace") ? (
                <span className="text-red-700 dark:text-red-300">
                  your categories, sources, persons, and tenses replaced by the
                  file&rsquo;s
                </span>
              ) : (
                <span className="text-slate-600 dark:text-slate-300">
                  nothing in this file, so yours stay as they are
                </span>
              )}
            </li>
          </ul>
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
            <ResultBlock
              label="Verb tables"
              counts={state.result.verbTables}
              mode={state.mode}
            />
            <div>
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                Settings
              </p>
              <p className="mt-1">
                {state.result.settingsRestored
                  ? "Categories, sources, persons, and tenses restored from the file."
                  : "Left as they were."}
              </p>
            </div>
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

function ReplaceLine({
  label,
  saved,
  incoming,
  untouched,
}: {
  label: string;
  saved: number;
  incoming: number;
  untouched: boolean;
}) {
  return (
    <li className="flex flex-wrap gap-x-1.5">
      <span className="font-medium">{label}:</span>
      {untouched ? (
        <span className="text-slate-600 dark:text-slate-300">
          nothing in this file, so your {saved} saved{" "}
          {saved === 1 ? "item stays" : "items stay"} as they are
        </span>
      ) : (
        <span className="text-red-700 dark:text-red-300">
          your {saved} deleted, replaced by {incoming} from the file
        </span>
      )}
    </li>
  );
}

function ScopeChoice({
  label,
  detail,
  checked,
  disabled,
  onSelect,
}: {
  label: string;
  detail: string;
  checked: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`flex flex-1 cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition ${
        checked
          ? "border-indigo-500 bg-indigo-50/60 dark:border-indigo-400 dark:bg-indigo-500/10"
          : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      <input
        type="radio"
        name="export-scope"
        className="mt-0.5 size-4 accent-indigo-600"
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">{detail}</span>
      </span>
    </label>
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
  savedVerbTables,
  mode,
  onModeChange,
  onCancel,
  onConfirm,
}: {
  preview: Preview;
  savedTerms: number;
  savedPhrases: number;
  savedVerbTables: number;
  mode: ImportMode;
  onModeChange: (mode: ImportMode) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const terms = preview.contents.entries.length;
  const phrases = preview.contents.phrases.length;
  const verbTables = preview.contents.verbTables.length;

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
            <li>
              {verbTables} {verbTables === 1 ? "verb table" : "verb tables"} —{" "}
              {verbTables - preview.matchingVerbTables} new to you,{" "}
              {preview.matchingVerbTables} of your {savedVerbTables} already saved.
            </li>
            <li>
              {!preview.contents.settings
                ? "No settings in this file; yours will be left alone."
                : restoresSettings(preview.contents, mode)
                  ? "Settings included — these will replace your own."
                  : "Settings included, but this option leaves your own alone."}
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
