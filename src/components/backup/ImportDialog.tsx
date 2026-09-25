"use client";

import { useEffect, useState } from "react";

import {
  MODE_OPTIONS,
  ReplaceLine,
  ResultBlock,
  WaitingForLists,
} from "@/components/backup/parts";
import { Modal } from "@/components/Modal";
import {
  applyImport,
  leavesListAlone,
  parseBackup,
  restoresSettings,
  type BackupContents,
  type ImportResult,
} from "@/lib/backup";
import { readFileAsText } from "@/lib/backupFile";
import { foldName } from "@/lib/foldName";
import type { ImportMode } from "@/lib/types";
import { useWords } from "@/lib/useWords";
import { usePhrases } from "@/lib/usePhrases";
import { useVerbTables } from "@/lib/useVerbTables";

type Preview = {
  contents: BackupContents;
  /** How many of the file's items already exist here, by name. */
  matchingWords: number;
  matchingPhrases: number;
  matchingVerbTables: number;
};

type State =
  | { step: "reading" }
  | { step: "error"; message: string }
  | { step: "preview"; preview: Preview }
  | { step: "confirmReplace"; preview: Preview }
  | { step: "done"; result: ImportResult; mode: ImportMode };

/**
 * Reads a chosen backup file, says what restoring it would do, and does it.
 *
 * The file is read here rather than by the caller because the "how much of
 * this do you already have?" counts need the lists, and the lists are only
 * fetched once this dialog is mounted. Reading waits for them for the same
 * reason the export does: matching against a list that has not arrived yet
 * would report every row in the file as new.
 */
export function ImportDialog({ file, onClose }: { file: File; onClose: () => void }) {
  const { entries, loaded: wordsLoaded } = useWords();
  const { phrases, loaded: phrasesLoaded } = usePhrases();
  const { tables, loaded: tablesLoaded } = useVerbTables();
  const [state, setState] = useState<State>({ step: "reading" });
  const [mode, setMode] = useState<ImportMode>("skip");

  const ready = wordsLoaded && phrasesLoaded && tablesLoaded;

  useEffect(() => {
    if (!ready) return;
    let current = true;

    void (async () => {
      let text: string;
      try {
        text = await readFileAsText(file);
      } catch {
        if (current) setState({ step: "error", message: "That file could not be read." });
        return;
      }
      if (!current) return;

      const parsed = parseBackup(text);
      if (!parsed.ok) {
        setState({ step: "error", message: parsed.error });
        return;
      }

      const savedWords = new Set(entries.map((entry) => foldName(entry.word)));
      const savedPhrases = new Set(phrases.map((phrase) => foldName(phrase.phrase)));
      const savedVerbs = new Set(tables.map((table) => foldName(table.verb)));

      setState({
        step: "preview",
        preview: {
          contents: {
            words: parsed.words,
            phrases: parsed.phrases,
            verbTables: parsed.verbTables,
            settings: parsed.settings,
            unreadable: parsed.unreadable,
          },
          matchingWords: parsed.words.filter((entry) =>
            savedWords.has(foldName(entry.word)),
          ).length,
          matchingPhrases: parsed.phrases.filter((phrase) =>
            savedPhrases.has(foldName(phrase.phrase)),
          ).length,
          matchingVerbTables: parsed.verbTables.filter((table) =>
            savedVerbs.has(foldName(table.verb)),
          ).length,
        },
      });
    })();

    return () => {
      current = false;
    };
    // Deliberately keyed on the file and on the lists being ready, not on the
    // lists themselves: a refresh landing mid-decision must not re-read the
    // file and throw away the mode the reader has chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, ready]);

  if (state.step === "reading") {
    return (
      <Modal title="Import a backup" onClose={onClose}>
        {ready ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Reading the file…</p>
        ) : (
          <WaitingForLists />
        )}
      </Modal>
    );
  }

  if (state.step === "error") {
    return (
      <Modal title="That backup could not be imported" onClose={onClose}>
        <p className="text-sm text-slate-600 dark:text-slate-300">{state.message}</p>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Choose a file that was created by Export.
        </p>
        <div className="mt-5 flex justify-end">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </Modal>
    );
  }

  if (state.step === "done") {
    return (
      <Modal title="Import finished" onClose={onClose}>
        <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300">
          <ResultBlock label="Words" counts={state.result.words} mode={state.mode} />
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
                ? "Collections, sources, persons, and tenses restored from the file."
                : "Left as they were."}
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  const { preview } = state;
  const { contents } = preview;

  if (state.step === "confirmReplace") {
    return (
      <Modal title="Replace what you have saved?" onClose={onClose}>
        <p className="text-sm text-slate-600 dark:text-slate-300">This cannot be undone.</p>
        <ul className="mt-3 space-y-2 text-sm">
          <ReplaceLine
            label="Words"
            saved={entries.length}
            incoming={contents.words.length}
            matching={preview.matchingWords}
            untouched={leavesListAlone(contents, "words", "replace")}
          />
          <ReplaceLine
            label="Phrases"
            saved={phrases.length}
            incoming={contents.phrases.length}
            matching={preview.matchingPhrases}
            untouched={leavesListAlone(contents, "phrases", "replace")}
          />
          <ReplaceLine
            label="Verb tables"
            saved={tables.length}
            incoming={contents.verbTables.length}
            matching={preview.matchingVerbTables}
            untouched={leavesListAlone(contents, "verbTables", "replace")}
          />
          <li className="flex flex-wrap gap-x-1.5">
            <span className="font-medium">Settings:</span>
            {restoresSettings(contents, "replace") ? (
              <span className="text-red-700 dark:text-red-300">
                your collections, sources, persons, and tenses replaced by the file&rsquo;s,
                except collections and sources your words and phrases still use
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
            onClick={() => setState({ step: "preview", preview })}
          >
            Go back
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() =>
              setState({
                step: "done",
                result: applyImport(contents, "replace"),
                mode: "replace",
              })
            }
          >
            Yes, replace
          </button>
        </div>
      </Modal>
    );
  }

  const wordCount = contents.words.length;
  const phraseCount = contents.phrases.length;
  const verbTableCount = contents.verbTables.length;

  return (
    <Modal title="Import a backup" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950/50">
          <p className="font-medium break-all">{file.name}</p>
          <ul className="mt-1 space-y-0.5 text-slate-600 dark:text-slate-300">
            <li>
              {wordCount} {wordCount === 1 ? "word" : "words"}:{" "}
              {wordCount - preview.matchingWords} new to you,{" "}
              {preview.matchingWords} of your {entries.length} already saved.
            </li>
            <li>
              {phraseCount} {phraseCount === 1 ? "phrase" : "phrases"}:{" "}
              {phraseCount - preview.matchingPhrases} new to you,{" "}
              {preview.matchingPhrases} of your {phrases.length} already saved.
            </li>
            <li>
              {verbTableCount} {verbTableCount === 1 ? "verb table" : "verb tables"}:{" "}
              {verbTableCount - preview.matchingVerbTables} new to you,{" "}
              {preview.matchingVerbTables} of your {tables.length} already saved.
            </li>
            <li>
              {!contents.settings
                ? "No settings in this file; yours will be left alone."
                : restoresSettings(contents, mode)
                  ? "Settings included. These will replace your own."
                  : "Settings included, but this option leaves your own alone."}
            </li>
          </ul>
          {contents.unreadable > 0 && (
            <p className="mt-1 text-amber-700 dark:text-amber-300">
              {contents.unreadable} {contents.unreadable === 1 ? "row was" : "rows were"}{" "}
              not readable and will be ignored.
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
                onChange={() => setMode(option.value)}
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
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${mode === "replace" ? "btn-danger" : "btn-primary"}`}
            onClick={() =>
              mode === "replace"
                ? setState({ step: "confirmReplace", preview })
                : setState({ step: "done", result: applyImport(contents, mode), mode })
            }
          >
            {mode === "replace" ? "Replace…" : "Import"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
