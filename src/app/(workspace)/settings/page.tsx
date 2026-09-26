"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useId, useState, useSyncExternalStore, type ReactNode } from "react";

import { NameListEditor } from "@/components/NameListEditor";
import { MAX_COLLECTIONS, MAX_NAME, MAX_SKIP_WORD, SEPARATOR_CHOICES } from "@/lib/constants";
import { foldName } from "@/lib/foldName";
import {
  canSortIn,
  languageMenu,
  languageName,
  MAX_LANGUAGE_NAME,
  presetFor,
  readLanguageName,
  type LanguageMenu,
} from "@/lib/languages";
import { SETTINGS_SECTIONS, readSection } from "@/lib/settingsSections";
import {
  chooseExportFolder,
  clearExportFolder,
  ExportFolderError,
  supportsExportFolder,
} from "@/lib/exportFolder";
import { MIN_PASSWORD, changePassword, sendPasswordReset, signOut } from "@/lib/session";
import { renameCollection, renameInList, renameSource, renameTopic } from "@/lib/renames";
import { saveSettings } from "@/lib/settings";
import { countUses, inUseReason } from "@/lib/inUse";
import { useExportFolder } from "@/lib/useExportFolder";
import { usePhrases } from "@/lib/usePhrases";
import { useRules } from "@/lib/useRules";
import { useSession } from "@/lib/useSession";
import { useSettings } from "@/lib/useSettings";
import { useWords } from "@/lib/useWords";

/**
 * The two lists words and phrases point at. A collection or source still in
 * use cannot be removed, since the database would refuse the delete, so the
 * bin says so instead of failing. The counts come from the word and phrase
 * lists the app already holds, which is why this section, and only this one,
 * reads them; until both have arrived nothing can be removed, because a count
 * of zero before the lists load would be a guess.
 */
function CollectionsAndSources() {
  const { settings } = useSettings();
  const { entries, loaded: wordsLoaded } = useWords();
  const { phrases, loaded: phrasesLoaded } = usePhrases();
  const listsLoaded = wordsLoaded && phrasesLoaded;

  const collectionUses = countUses([
    ...entries.map((entry) => entry.collections),
    ...phrases.map((phrase) => phrase.collections),
  ]);
  const sourceUses = countUses([
    ...entries.map((entry) => [entry.source]),
    ...phrases.map((phrase) => [phrase.source]),
  ]);
  const blocked = (uses: Map<string, number>) => (name: string) =>
    listsLoaded ? inUseReason(uses, name) : "Checking whether anything uses it";

  return (
    <>
      {/*
       * "Glossary Collections" rather than "Collections": the one list is
       * offered on the word form and the phrase form alike, and naming the
       * section after the tab those two share says so without spelling out
       * both.
       */}
      <SettingSection title="Glossary Collections">
        <NameListEditor
          legend="Glossary Collections"
          description={`The groups the word and phrase forms offer. A word or phrase can be in up to ${MAX_COLLECTIONS} of them. Renaming one renames it everywhere it is used, and renaming it to the name of another merges the two. One that is in use cannot be removed.`}
          names={settings.collections}
          onChange={(collections) => saveSettings({ collections })}
          onRename={renameCollection}
          removeBlockedBy={blocked(collectionUses)}
          maxLength={MAX_NAME}
          placeholder="e.g. Travel"
        />
      </SettingSection>

      <SettingSection title="Sources">
        <NameListEditor
          legend="Sources"
          description="Where a definition came from. Shown on a word or phrase when you open it. Renaming one renames it on everything that came from it. One that is in use cannot be removed."
          names={settings.sources}
          onChange={(sources) => saveSettings({ sources })}
          onRename={renameSource}
          removeBlockedBy={blocked(sourceUses)}
          maxLength={MAX_NAME}
          minimum={1}
          placeholder="e.g. Textbook"
        />
      </SettingSection>
    </>
  );
}

/**
 * The topics rules are filed under. One per rule, so a topic still on a rule
 * cannot be removed, for the reason a collection in use cannot: the database
 * refuses the delete, and the bin says so first.
 */
function Topics() {
  const { settings } = useSettings();
  const { rules, loaded } = useRules();
  const uses = countUses(rules.map((rule) => [rule.topic]));

  return (
    <SettingSection title="Topics">
      <NameListEditor
        legend="Topics"
        description="What a grammar rule is filed under: Cases, Word order, Tenses. Every rule has one. Renaming one renames it on every rule, and renaming it to the name of another merges the two. One that is in use cannot be removed."
        names={settings.topics}
        onChange={(topics) => saveSettings({ topics })}
        onRename={renameTopic}
        removeBlockedBy={(name) =>
          loaded ? inUseReason(uses, name, "rule", "rules") : "Checking whether anything uses it"
        }
        maxLength={MAX_NAME}
        placeholder="e.g. Cases"
      />
    </SettingSection>
  );
}

/**
 * Settings: who you are, the lists the forms offer, and where exports are
 * written. Reached from the account menu rather than the main
 * tabs, which belong to the two lists.
 *
 * Every section is rolled up to its name and what it is currently set to, so
 * the page reads as a summary and opens only what you came to change. The
 * list sections show their name alone: spelling out eight collections on a row
 * meant to be skimmed would defeat the point of rolling it up.
 *
 * The lists and the name are per account and follow you between devices. The
 * export folder cannot — see `exportFolder.ts` for why — so it says as much
 * on the section itself rather than leaving the difference to be discovered.
 */
export default function SettingsPage() {
  // `useSearchParams` needs one, and the fallback is what shows while the
  // section is still unknown.
  return (
    <Suspense fallback={<Frame section={SETTINGS_SECTIONS[0]}>{null}</Frame>}>
      <Settings />
    </Suspense>
  );
}

function Settings() {
  const { settings, loaded } = useSettings();
  const section = readSection(useSearchParams().get("section"));

  return (
    <Frame section={section}>
      <div className="space-y-3">
        {section.key === "profile" && (
          <>
            {/* Keyed on the stored name so a save, or a change in another tab,
                remounts the field with the new value — React’s way of resetting
                state from a prop without an effect that writes state. */}
            <ProfileSection
              key={settings.displayName}
              displayName={settings.displayName}
              loaded={loaded}
            />

            <PasswordSection />

            <ExportFolderSection />
          </>
        )}

        {section.key === "glossary" && (
          <>
            <LanguageSection />

            <SettingSection title="Words to skip when sorting">
              <NameListEditor
                legend="Words to skip when sorting"
                description="Leading words Vocabulary sorts past, usually articles. With der on the list, der Tisch sorts under T. A word ending in an apostrophe, such as l', needs no space after it."
                names={settings.sortSkipWords}
                onChange={(sortSkipWords) => saveSettings({ sortSkipWords })}
                onRename={(from, to) => renameInList("sortSkipWords", from, to)}
                placeholder="e.g. der"
                maxLength={MAX_SKIP_WORD}
              />
            </SettingSection>

            <CollectionsAndSources />

            <SettingSection title="Verb persons">
              <NameListEditor
                legend="Verb persons"
                description="The people a conjugation table is built from, in the order the rows should appear: a person added here goes to the end. Changing this shapes the next table you make; tables you already have keep the rows they were made with."
                names={settings.verbPersons}
                onChange={(verbPersons) => saveSettings({ verbPersons })}
                onRename={(from, to) => renameInList("verbPersons", from, to)}
                placeholder="e.g. ich"
              />
            </SettingSection>

            <SettingSection title="Verb tenses">
              <NameListEditor
                legend="Verb tenses"
                description="Offered when a conjugation table is made. A tense typed there is added here automatically. Renaming one here leaves tables you already have as they are."
                names={settings.verbTenses}
                onChange={(verbTenses) => saveSettings({ verbTenses })}
                onRename={(from, to) => renameInList("verbTenses", from, to)}
                placeholder="e.g. Present"
              />
            </SettingSection>
          </>
        )}

        {section.key === "grammar" && <Topics />}

        {section.key === "flashcards" && <AnswerSeparatorsSection />}
      </div>
    </Frame>
  );
}

/**
 * The heading and the shell every group shares.
 *
 * Separate so the Suspense fallback is the same page with nothing in it
 * rather than a different one: the heading does not depend on which group is
 * chosen being known yet, and swapping the whole page for a spinner to learn
 * one query parameter would be a flash for no reason.
 */
function Frame({
  section,
  children,
}: {
  section: (typeof SETTINGS_SECTIONS)[number];
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {section.label}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {section.description}
        </p>
      </header>

      {/* A failed settings save used to be reported here, and only here —
          which meant a save made from the verbs page or a table card failed
          silently. `StoreErrorBanner` in the workspace layout now shows it
          wherever it happens, so repeating it on this page would say the same
          thing twice. */}

      {children}
    </main>
  );
}


/* --------------------------------------------------------------- language */

/** The menu's value for a language typed in by name. Not a language code. */
const OTHER_LANGUAGE = "other";

const neverChanges = () => () => {};

/**
 * The language menu, or null during the server render and hydration.
 *
 * The server's `Intl` is a different build from the browser's, with a
 * different set of languages it can sort, so a menu rendered there would not
 * match the one the browser hydrates. Null there and the real menu after is
 * what `useSyncExternalStore` gives with a server snapshot of its own.
 */
function useLanguageMenu(): LanguageMenu | null {
  return useSyncExternalStore(neverChanges, languageMenu, () => null);
}

/** Two word lists that say the same thing, ignoring case and order. */
function sameWords(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const folded = new Set(a.map(foldName));
  return b.every((word) => folded.has(foldName(word)));
}

/**
 * Two lists of persons that say the same thing, ignoring case but not order.
 * Order counts here, unlike for the words to skip: it is a table's row order,
 * and a reader who rearranged a ready-made list has made it their own.
 */
function samePersons(a: readonly string[], b: readonly string[]): boolean {
  return (
    a.length === b.length && a.every((name, index) => foldName(name) === foldName(b[index]))
  );
}

/** A list a change of language would replace, waiting on the reader. */
type ListOffer = {
  list: "sortSkipWords" | "verbPersons";
  /** Empty means the new language has none, so the offer is to clear. */
  names: readonly string[];
};

/**
 * Which language is being learned. It sets the alphabetical order of every
 * list, and choosing one with ready-made lists fills the words to skip and
 * the verb persons.
 *
 * Changing language never throws away names someone typed without asking.
 * A list is replaced without a question only when there is nothing of the
 * reader's own in it: empty, or exactly the list the previous language, or
 * the new one, came with. Otherwise the language changes at once and that
 * list waits on an answer, one list at a time, since keeping one is a
 * reasonable thing to want for someone learning two languages at once.
 */
function LanguageSection() {
  const { settings, loaded } = useSettings();
  const menu = useLanguageMenu();
  const selectId = useId();
  const { language, languageOther, sortSkipWords, verbPersons } = settings;

  const [typingOther, setTypingOther] = useState(false);
  /** Lists waiting on the reader, for the language just chosen. */
  const [offer, setOffer] = useState<{ name: string; lists: ListOffer[] } | null>(null);

  const chosenName = language ? languageName(language) : languageOther;
  // Typing a name wins over a saved code: the code stays saved until the
  // name is, and the field has to show in the meantime.
  const value =
    typingOther || (!language && languageOther) ? OTHER_LANGUAGE : language;
  // Asked only once the menu exists, which is only ever in the browser.
  const cannotSort = menu !== null && language !== "" && !canSortIn(language);
  // A code chosen on another browser that this one cannot sort in is still
  // the account's choice, and the menu has to be able to show it.
  const missingFromMenu =
    menu !== null &&
    language !== "" &&
    ![...menu.presets, ...menu.others].some((entry) => entry.code === language);

  function apply(code: string, other: string) {
    // Picking the language already chosen, after backing out of typing
    // another, changes nothing and has nothing to ask about.
    if (code === language && other === languageOther) {
      setOffer(null);
      return;
    }

    // Renaming a typed-in language, "Welsh" to "Cymraeg", is the same
    // language spelled another way, and the lists made for it still apply.
    if (!code && !language && languageOther !== "") {
      saveSettings({ language: code, languageOther: other });
      setOffer(null);
      return;
    }

    const next = presetFor(code);
    const previous = presetFor(language);
    const change: { sortSkipWords?: string[]; verbPersons?: string[] } = {};
    const waiting: ListOffer[] = [];

    // The words to skip always follow the language, cleared when it has none:
    // another language's articles would only skip the wrong words.
    const words = next?.skipWords ?? [];
    if (
      sortSkipWords.length === 0 ||
      sameWords(sortSkipWords, previous?.skipWords ?? []) ||
      sameWords(sortSkipWords, words)
    ) {
      change.sortSkipWords = [...words];
    } else {
      waiting.push({ list: "sortSkipWords", names: words });
    }

    // Persons follow only a language that has some. One whose verbs do not
    // change with the person, or one with no ready-made list, leaves them as
    // they are: a list of persons is still a starting point, and an empty one
    // only means the Verbs page asks before the first table.
    const persons = next?.verbPersons ?? [];
    if (persons.length > 0) {
      if (
        verbPersons.length === 0 ||
        samePersons(verbPersons, previous?.verbPersons ?? []) ||
        samePersons(verbPersons, persons)
      ) {
        change.verbPersons = [...persons];
      } else {
        waiting.push({ list: "verbPersons", names: persons });
      }
    }

    saveSettings({ language: code, languageOther: other, ...change });
    setOffer(
      waiting.length > 0 ? { name: code ? languageName(code) : other, lists: waiting } : null,
    );
  }

  /** Answers one waiting list, and closes the panel once none are left. */
  function answer(list: ListOffer["list"], replace: boolean) {
    if (!offer) return;
    const entry = offer.lists.find((item) => item.list === list);
    if (replace && entry) saveSettings({ [list]: [...entry.names] });
    const left = offer.lists.filter((item) => item.list !== list);
    setOffer(left.length > 0 ? { ...offer, lists: left } : null);
  }

  function choose(next: string) {
    if (next === OTHER_LANGUAGE) {
      // The language is saved once it has a name; until then the menu just
      // shows the field for it.
      setTypingOther(true);
      setOffer(null);
      return;
    }
    setTypingOther(false);
    apply(next, "");
  }

  return (
    <SettingSection title="Language" summary={chosenName || "Not chosen"}>
      <label htmlFor={selectId} className="mb-1 block text-sm font-medium">
        Language you are learning
      </label>
      <select
        id={selectId}
        className="field"
        value={value}
        disabled={!loaded || menu === null}
        onChange={(event) => choose(event.target.value)}
      >
        <option value="">Not chosen</option>
        {missingFromMenu && <option value={language}>{chosenName}</option>}
        {menu && (
          <optgroup label="Most learned">
            {menu.presets.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.name}
              </option>
            ))}
          </optgroup>
        )}
        {menu && (
          <optgroup label="All languages">
            {menu.others.map((entry) => (
              <option key={entry.code} value={entry.code}>
                {entry.name}
              </option>
            ))}
          </optgroup>
        )}
        <option value={OTHER_LANGUAGE}>Another language</option>
      </select>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Sets the alphabetical order of every list.
      </p>

      {value === OTHER_LANGUAGE && (
        // Keyed on the saved name so a save, or a change in another tab,
        // starts the field again from what is stored.
        <OtherLanguageField
          key={languageOther}
          saved={languageOther}
          onSave={(name) => {
            setTypingOther(false);
            apply("", name);
          }}
        />
      )}

      {cannotSort && (
        <p role="status" className="mt-3 text-sm text-amber-700 dark:text-amber-300">
          This browser cannot sort in {chosenName}, so lists here use a neutral
          alphabetical order.
        </p>
      )}

      {offer && (
        <div
          role="status"
          className="mt-4 space-y-4 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800"
        >
          {offer.lists.map(({ list, names }) => {
            const label = list === "sortSkipWords" ? "words to skip" : "verb persons";
            return (
              <div key={list}>
                <p>
                  {names.length > 0
                    ? `Replace your ${label} with the ${offer.name} list (${names.join(", ")})?`
                    : offer.name
                      ? `There is no list of ${label} for ${offer.name}. Clear yours?`
                      : `Clear your ${label} as well?`}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => answer(list, true)}
                  >
                    {names.length > 0 ? "Replace" : "Clear"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => answer(list, false)}
                  >
                    Keep mine
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SettingSection>
  );
}

/** The name of a language the menu does not have. */
function OtherLanguageField({
  saved,
  onSave,
}: {
  saved: string;
  onSave: (name: string) => void;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState(saved);
  const name = readLanguageName(draft);

  function save() {
    if (name && name !== saved) onSave(name);
  }

  return (
    <div className="mt-4">
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium">
        Language name
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          className="field flex-1"
          value={draft}
          maxLength={MAX_LANGUAGE_NAME}
          placeholder="e.g. Welsh"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            save();
          }}
        />
        <button
          type="button"
          className="btn btn-secondary shrink-0"
          disabled={!name || name === saved}
          onClick={save}
        >
          Save
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Lists use a neutral alphabetical order. Add its articles to Words to skip when
        sorting.
      </p>
    </div>
  );
}

/**
 * Which punctuation means "or" when a flashcard answer is marked.
 *
 * Tick boxes over a fixed set rather than a text field, and the reason is not
 * tidiness: a letter typed in here would split every answer containing that
 * letter, and marking would stop working in a way nobody would connect to a
 * settings change made weeks earlier. The database refuses anything else too,
 * so this is the same rule said twice on purpose.
 */
function AnswerSeparatorsSection() {
  const { settings } = useSettings();
  const chosen = settings.answerSeparators;

  const summary =
    chosen === ""
      ? "None; answers must be typed in full"
      : SEPARATOR_CHOICES.filter((choice) => chosen.includes(choice.character))
          .map((choice) => choice.label.toLowerCase())
          .join(", ");

  function toggle(character: string) {
    const next = chosen.includes(character)
      ? chosen.replace(character, "")
      : chosen + character;
    saveSettings({ answerSeparators: next });
  }

  return (
    <SettingSection title="Answer separators" summary={summary}>
      <fieldset>
        <legend className="text-sm text-slate-600 dark:text-slate-300">
          When a flashcard is marked, these characters separate one acceptable answer from
          the next. An entry reading <strong>gladly, willingly</strong> is then answered by
          either word, by both, or by both in the other order.
        </legend>

        <div className="mt-3 flex flex-col gap-2">
          {SEPARATOR_CHOICES.map((choice) => (
            <label
              key={choice.character}
              className="flex cursor-pointer items-center gap-3 text-sm select-none"
            >
              <input
                type="checkbox"
                className="size-4 accent-indigo-600"
                checked={chosen.includes(choice.character)}
                onChange={() => toggle(choice.character)}
              />
              <span className="font-medium">{choice.label}</span>
              <span className="text-slate-500 dark:text-slate-400">{choice.example}</span>
            </label>
          ))}
        </div>

        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          A character listed here stops being ordinary text in an answer: with the slash
          ticked, an entry reading <strong>and/or</strong> offers two answers rather than
          one. Untick everything to have answers marked exactly as they are written.
        </p>
      </fieldset>
    </SettingSection>
  );
}

/* ------------------------------------------------------------ the roll-up */

function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
    >
      <path d="M11.5 2.5a1.4 1.4 0 0 1 2 2L6 12l-3 1 1-3 7.5-7.5Z" />
    </svg>
  );
}

/**
 * One rolled-up setting: its name, what it is set to, and a pencil that opens
 * the controls underneath. Left mounted while closed rather than unmounted,
 * so a half-typed entry is still there if you fold it away and open it again.
 */
function SettingSection({
  title,
  summary,
  children,
}: {
  title: string;
  /** Omitted for the list settings, which show their name alone. */
  summary?: ReactNode;
  children: ReactNode;
}) {
  const bodyId = useId();
  const [open, setOpen] = useState(false);

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {summary !== undefined && (
            <p className="mt-0.5 truncate text-sm text-slate-600 dark:text-slate-300">
              {summary}
            </p>
          )}
        </div>

        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={open ? `Finish editing ${title}` : `Edit ${title}`}
          title={open ? "Done" : `Edit ${title}`}
          onClick={() => setOpen((current) => !current)}
          className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        >
          {open ? "Done" : <PencilIcon />}
        </button>
      </div>

      <div
        id={bodyId}
        hidden={!open}
        className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800"
      >
        {children}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- profile */

function ProfileSection({ displayName, loaded }: { displayName: string; loaded: boolean }) {
  const { user } = useSession();
  const [draft, setDraft] = useState(displayName);

  const changed = draft.trim() !== displayName;

  return (
    <SettingSection title="Profile" summary={displayName || user?.email || "Not set"}>
      <dl>
        <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
          Signed in as
        </dt>
        <dd className="mt-1 text-sm break-words">{user?.email ?? "Not set"}</dd>
      </dl>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        The address itself is the account. You can sign in with a one-time
        emailed link, or set a password below and use that instead.
      </p>

      <div className="mt-4">
        <label htmlFor="display-name" className="mb-1 block text-sm font-medium">
          Display name
        </label>
        <div className="flex gap-2">
          <input
            id="display-name"
            className="field flex-1"
            value={draft}
            disabled={!loaded}
            placeholder="Shown in the nav instead of your email"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              saveSettings({ displayName: draft });
            }}
          />
          <button
            type="button"
            className="btn btn-secondary shrink-0"
            disabled={!changed}
            onClick={() => saveSettings({ displayName: draft })}
          >
            Save
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Optional. Leave it empty to go back to showing your email address.
        </p>
      </div>

      <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
        <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </SettingSection>
  );
}

/* ------------------------------------------------------------ password */

/**
 * Gives this account a password, or replaces the one it has.
 *
 * The point of it is the email sender: an account signed into by link alone
 * can only get in as often as the sender will send, which is one link a minute
 * and a few an hour, and signing out a few times in an afternoon is enough to
 * be locked out for a while. A password has no such limit.
 *
 * There is no "current password" field. Supabase accepts the change on the
 * strength of the session alone, and requiring one here would shut out exactly
 * the people this section is for — the accounts that have no password yet.
 */
/**
 * Changing the password of the account you are signed in to.
 *
 * It asks for the current one first, which `updateUser` does not. A session is
 * a weaker claim than knowing the password: it may be a browser somebody
 * walked away from, and a screen that changes the password without asking is a
 * screen that hands the account over. Supabase does the checking, by being
 * asked to sign in with what was typed, so nothing here ever holds a password
 * of its own.
 *
 * An account made through an emailed link has no current password to give, and
 * a reader who has forgotten theirs is in the same position. Both are served
 * by the reset link below, which proves the mailbox instead and lands on a
 * form that asks for nothing but the new password.
 */
function PasswordSection() {
  const { user } = useSession();
  const [current, setCurrent] = useState("");
  const [password, setPasswordDraft] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function typing(set: (value: string) => void) {
    return (event: React.ChangeEvent<HTMLInputElement>) => {
      set(event.target.value);
      setDone(false);
      setSent(false);
      setError(null);
    };
  }

  async function save() {
    if (!user) return;
    if (password.length < MIN_PASSWORD) {
      setError(`A password needs at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    if (password === current) {
      setError("That is the password you already have.");
      return;
    }

    setBusy(true);
    setError(null);
    const { error: failure } = await changePassword(user.email, current, password);
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }

    setCurrent("");
    setPasswordDraft("");
    setConfirm("");
    setDone(true);
  }

  async function emailAReset() {
    if (!user) return;
    setBusy(true);
    setError(null);
    const { error: failure } = await sendPasswordReset(user.email);
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    setSent(true);
  }

  return (
    <SettingSection title="Password" summary="Change the password you sign in with">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Give the password you use now, then the one you would rather use. Everywhere else
        that is signed in to this account is signed out, which is the point of changing it.
      </p>

      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="current-password" className="mb-1.5 block text-sm font-medium">
            Current password
          </label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            className="field"
            value={current}
            onChange={typing(setCurrent)}
          />
        </div>

        <div>
          <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium">
            New password
          </label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            className="field"
            value={password}
            onChange={typing(setPasswordDraft)}
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            At least {MIN_PASSWORD} characters.
          </p>
        </div>

        <div>
          <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium">
            Again, to be sure
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            className="field"
            value={confirm}
            onChange={typing(setConfirm)}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        {done && (
          <p role="status" className="text-sm text-green-700 dark:text-green-400">
            Password changed. Use it with your email address next time you sign in.
          </p>
        )}

        {sent && (
          <p role="status" className="text-sm text-green-700 dark:text-green-400">
            A link is on its way to {user?.email}. Opening it brings you to a form that asks
            for nothing but the new password.
          </p>
        )}

        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || !current || !password || !confirm}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Change password"}
        </button>

        {/* The way in for an account that has no password to give: one made by
            following an emailed link has never had one, and a reader who has
            forgotten theirs is in the same position. The link proves the
            mailbox, which is the proof the current-password box was asking
            for by another route. */}
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Do not know your current password?{" "}
          <button
            type="button"
            className="link-button"
            disabled={busy}
            onClick={() => void emailAReset()}
          >
            Email yourself a reset link
          </button>
          .
        </p>
      </div>
    </SettingSection>
  );
}

function ExportFolderSection() {
  const { name, loaded } = useExportFolder();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Read on each render rather than held in state: it cannot change while the
  // page is open, and it is false during the server render.
  const canChoose = supportsExportFolder();

  async function choose() {
    setBusy(true);
    setError(null);
    try {
      await chooseExportFolder();
    } catch (cause) {
      setError(
        cause instanceof ExportFolderError
          ? cause.message
          : "That folder could not be opened. Please try another.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function switchToDownloads() {
    setBusy(true);
    setError(null);
    await clearExportFolder();
    setBusy(false);
  }

  return (
    <SettingSection
      title="Export folder"
      summary={
        !loaded ? "Checking…" : (name ?? "Your browser’s download folder")
      }
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Where{" "}
        <Link
          href="/vocabulary"
          className="text-indigo-700 underline underline-offset-2 dark:text-indigo-300"
        >
          Export
        </Link>{" "}
        writes its files. The Excel workbook and the JSON backup both go here,
        and their names do not change. This one is remembered for this browser
        only. A folder cannot follow an account to another machine.
      </p>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {canChoose ? (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void choose()}
            >
              {name ? "Change folder" : "Choose folder"}
            </button>
            {name && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => void switchToDownloads()}
              >
                Use the download folder
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Your browser may ask you to confirm access again in a new session,
            and if the folder is later moved or deleted the export will say so
            and offer you another one.
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
          This browser cannot hand a folder to a web page, so exports go to its
          own download folder. Change that in the browser&rsquo;s settings.
          Choosing a folder here works in Chrome and Edge.
        </p>
      )}
    </SettingSection>
  );
}
