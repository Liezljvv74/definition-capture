"use client";

import { useState } from "react";

import { ExportChoice, ScopeChoice, WaitingForLists } from "@/components/backup/parts";
import { Modal } from "@/components/Modal";
import type { BackupScope } from "@/lib/backup";
import {
  downloadExcelBackup,
  downloadJsonBackup,
  type ExportFormat,
  type ExportSummary,
} from "@/lib/backupFile";
import {
  chooseExportFolder,
  clearExportFolder,
  ExportFolderError,
} from "@/lib/exportFolder";
import { useRules } from "@/lib/useRules";
import { useWords } from "@/lib/useWords";
import { usePhrases } from "@/lib/usePhrases";
import { useVerbTables } from "@/lib/useVerbTables";

type State =
  | { step: "choosing" }
  | { step: "working" }
  | { step: "failed"; message: string }
  /** Written. Says where, which is the one thing the reader cannot see. */
  | { step: "done"; summary: ExportSummary }
  /** The chosen folder let us down. Keeps the format so it can be retried. */
  | { step: "folderFailed"; message: string; format: ExportFormat };

/**
 * Choose what to export and in which format.
 *
 * The scope is named outright — Everything, Words, Phrases, Verb tables —
 * rather than offered as "everything or this page". It used to read the
 * current path, which worked while these controls only appeared on the two
 * list pages. From the nav bar there is no such thing as "this page": on
 * Settings it names no list at all, and on Verbs it named the wrong one.
 */
export function ExportDialog({ onClose }: { onClose: () => void }) {
  const { entries, loaded: wordsLoaded } = useWords();
  const { phrases, loaded: phrasesLoaded } = usePhrases();
  const { tables, loaded: tablesLoaded } = useVerbTables();
  const { rules, loaded: rulesLoaded } = useRules();
  const [scope, setScope] = useState<BackupScope>("all");
  const [state, setState] = useState<State>({ step: "choosing" });

  const ready = wordsLoaded && phrasesLoaded && tablesLoaded && rulesLoaded;
  const busy = state.step === "working";

  const counts: Record<BackupScope, number> = {
    all: entries.length + phrases.length + tables.length + rules.length,
    words: entries.length,
    phrases: phrases.length,
    verbTables: tables.length,
    rules: rules.length,
  };

  async function runExport(format: ExportFormat) {
    setState({ step: "working" });
    try {
      // Both formats are built and written asynchronously, so a failure lands
      // here rather than leaving the dialog open with nothing happening.
      const summary =
        format === "json"
          ? await downloadJsonBackup(scope)
          : await downloadExcelBackup(scope);
      // Not closed on success. `exportFolder.ts` argues that sending a backup
      // somewhere unexpected is worse than an error, so the one thing the
      // reader cannot see for themselves is where the file went.
      setState({ step: "done", summary });
    } catch (cause) {
      // A folder problem is worth its own screen: the file is fine, it is the
      // destination that is not, and that is something the reader can fix
      // without leaving the dialog.
      if (cause instanceof ExportFolderError) {
        setState({ step: "folderFailed", message: cause.message, format });
        return;
      }
      setState({
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
      setState({
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

  return (
    <Modal title="Export" onClose={() => (busy ? undefined : onClose())}>
      {state.step === "done" ? (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Saved{" "}
            <span className="font-medium break-all">{state.summary.fileName}</span>{" "}
            {state.summary.folder === null
              ? "to your browser’s download folder"
              : `to ${state.summary.folder}`}
            .
          </p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {state.summary.count} {state.summary.count === 1 ? "item" : "items"} written.
          </p>
          <div className="mt-5 flex justify-end">
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      ) : state.step === "folderFailed" ? (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-300">{state.message}</p>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            Nothing was saved. Choose another folder and the export will finish there, or
            send this one to your browser&rsquo;s download folder.
          </p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void retryInDownloads(state.format)}
            >
              Use the download folder
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void retryInNewFolder(state.format)}
            >
              Choose another folder
            </button>
          </div>
        </>
      ) : state.step === "failed" ? (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-300">{state.message}</p>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setState({ step: "choosing" })}
            >
              Back
            </button>
          </div>
        </>
      ) : !ready ? (
        <WaitingForLists />
      ) : counts.all === 0 ? (
        <>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            There is nothing saved yet, so there is nothing to export.
          </p>
          <div className="mt-5 flex justify-end">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">What to export</legend>
            <div className="flex flex-col gap-2">
              <ScopeChoice
                label="Everything"
                detail={`${counts.all} across all lists`}
                checked={scope === "all"}
                disabled={busy}
                onSelect={() => setScope("all")}
              />
              <ScopeChoice
                label="Words"
                detail={`${counts.words} ${counts.words === 1 ? "word" : "words"}`}
                checked={scope === "words"}
                disabled={busy}
                onSelect={() => setScope("words")}
              />
              <ScopeChoice
                label="Phrases"
                detail={`${counts.phrases} ${counts.phrases === 1 ? "phrase" : "phrases"}`}
                checked={scope === "phrases"}
                disabled={busy}
                onSelect={() => setScope("phrases")}
              />
              <ScopeChoice
                label="Verb tables"
                detail={`${counts.verbTables} ${counts.verbTables === 1 ? "table" : "tables"}`}
                checked={scope === "verbTables"}
                disabled={busy}
                onSelect={() => setScope("verbTables")}
              />
              <ScopeChoice
                label="Grammar rules"
                detail={`${counts.rules} ${counts.rules === 1 ? "rule" : "rules"}`}
                checked={scope === "rules"}
                disabled={busy}
                onSelect={() => setScope("rules")}
              />
            </div>
          </fieldset>

          <p className="text-sm text-slate-600 dark:text-slate-300">
            {counts[scope]} {counts[scope] === 1 ? "item" : "items"} selected. Which
            format?
          </p>

          <ExportChoice
            title="Excel workbook (.xlsx)"
            detail={
              scope === "all"
                ? "Words, Phrases, Verb tables, and Grammar rules on separate sheets. Best for reading, sorting, or printing outside the app."
                : "One sheet. Best for reading, sorting, or printing outside the app."
            }
            disabled={busy || counts[scope] === 0}
            onClick={() => runExport("xlsx")}
          />
          <ExportChoice
            title="JSON backup (.json)"
            detail={
              scope === "all"
                ? "The complete backup, settings included. This is the only format Import can read back in."
                : "This one list only. Restoring it leaves your other lists alone."
            }
            disabled={busy || counts[scope] === 0}
            onClick={() => runExport("json")}
          />

          {busy && (
            <p className="text-sm text-slate-500 dark:text-slate-400">Preparing…</p>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
