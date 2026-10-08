"use client";

import { useEffect, useState } from "react";

import {
  MODE_OPTIONS,
  ReplaceLine,
  ResultBlock,
  ScopeChoice,
  WaitingForLists,
} from "@/components/backup/parts";
import { Modal } from "@/components/Modal";
import {
  applyImport,
  leavesListAlone,
  parseBackup,
  restoresSettings,
  type BackupContents,
  type BackupList,
  type ImportResult,
} from "@/lib/backup";
import { foldName } from "@/lib/foldName";
import { plural } from "@/lib/home";
import type { ImportMode } from "@/lib/types";
import { useRules } from "@/lib/useRules";
import { useWords } from "@/lib/useWords";
import { usePhrases } from "@/lib/usePhrases";
import { useVerbTables } from "@/lib/useVerbTables";

type Lists = Pick<BackupContents, BackupList>;

/**
 * The four lists, in the order every screen here shows them. `names` reads
 * the saved lists and the file's alike, since they share a shape, so the two
 * sides of a match cannot read different fields.
 */
const LISTS: {
  key: BackupList;
  label: string;
  one: string;
  many: string;
  names: (lists: Lists) => string[];
}[] = [
  { key: "words", label: "Words", one: "word", many: "words", names: (l) => l.words.map((w) => w.word) },
  { key: "phrases", label: "Phrases", one: "phrase", many: "phrases", names: (l) => l.phrases.map((p) => p.phrase) },
  { key: "verbTables", label: "Verb tables", one: "verb table", many: "verb tables", names: (l) => l.verbTables.map((t) => t.verb) },
  { key: "rules", label: "Grammar rules", one: "grammar rule", many: "grammar rules", names: (l) => l.rules.map((r) => r.title) },
];

type Preview = {
  contents: BackupContents;
  /** How many of the file's items already exist here, by name. */
  matching: Record<BackupList, number>;
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
  const { rules, loaded: rulesLoaded } = useRules();
  const [state, setState] = useState<State>({ step: "reading" });
  const [mode, setMode] = useState<ImportMode>("skip");

  const ready = wordsLoaded && phrasesLoaded && tablesLoaded && rulesLoaded;
  const saved: Lists = { words: entries, phrases, verbTables: tables, rules };

  useEffect(() => {
    if (!ready) return;
    let current = true;

    void (async () => {
      let text: string;
      try {
        text = await file.text();
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

      setState({
        step: "preview",
        preview: {
          contents: {
            words: parsed.words,
            phrases: parsed.phrases,
            verbTables: parsed.verbTables,
            rules: parsed.rules,
            settings: parsed.settings,
            unreadable: parsed.unreadable,
          },
          matching: Object.fromEntries(
            LISTS.map(({ key, names }) => {
              const savedNames = new Set(names(saved).map(foldName));
              return [key, names(parsed).filter((name) => savedNames.has(foldName(name))).length];
            }),
          ) as Record<BackupList, number>,
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
          <p className="text-sm text-ink-soft">Reading the file…</p>
        ) : (
          <WaitingForLists />
        )}
      </Modal>
    );
  }

  if (state.step === "error") {
    return (
      <Modal title="That backup could not be imported" onClose={onClose}>
        <p className="text-sm text-ink-soft">{state.message}</p>
        <p className="mt-3 text-sm text-ink-soft">
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
        <div className="space-y-4 text-sm text-ink-soft">
          {LISTS.map(({ key, label }) => (
            <ResultBlock key={key} label={label} counts={state.result[key]} mode={state.mode} />
          ))}
          <div>
            <p className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
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
        <p className="text-sm text-ink-soft">This cannot be undone.</p>
        <ul className="mt-3 space-y-2 text-sm">
          {LISTS.map(({ key, label }) => (
            <ReplaceLine
              key={key}
              label={label}
              saved={saved[key].length}
              incoming={contents[key].length}
              matching={preview.matching[key]}
              untouched={leavesListAlone(contents, key, "replace")}
            />
          ))}
          <li className="flex flex-wrap gap-x-1.5">
            <span className="font-medium">Settings:</span>
            {restoresSettings(contents, "replace") ? (
              <span className="text-red-700 dark:text-red-300">
                your collections, sources, persons, and tenses replaced by the file&rsquo;s,
                except collections and sources your words and phrases still use
              </span>
            ) : (
              <span className="text-ink-soft">
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

  return (
    <Modal title="Import a backup" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg border border-rule bg-marker/25 p-3 text-sm">
          <p className="font-medium break-all">{file.name}</p>
          <ul className="mt-1 space-y-0.5 text-ink-soft">
            {LISTS.map(({ key, one, many }) => (
              <li key={key}>
                {plural(contents[key].length, one, many)}:{" "}
                {contents[key].length - preview.matching[key]} new to you,{" "}
                {preview.matching[key]} of your {saved[key].length} already saved.
              </li>
            ))}
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
            <ScopeChoice
              key={option.value}
              name="import-mode"
              label={option.label}
              detail={option.hint}
              checked={mode === option.value}
              disabled={false}
              onSelect={() => setMode(option.value)}
            />
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
