"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

import { NameListEditor } from "@/components/NameListEditor";
import { MAX_CATEGORIES } from "@/lib/constants";
import {
  chooseExportFolder,
  clearExportFolder,
  ExportFolderError,
  supportsExportFolder,
} from "@/lib/exportFolder";
import { MIN_PASSWORD, setPassword, signOut } from "@/lib/session";
import { saveSettings } from "@/lib/settings";
import { useExportFolder } from "@/lib/useExportFolder";
import { useSession } from "@/lib/useSession";
import { useSettings } from "@/lib/useSettings";

/**
 * Settings: who you are, the lists the forms offer, and where exports are
 * written. Reached from the account menu rather than the main
 * tabs, which belong to the two lists.
 *
 * Every section is rolled up to its name and what it is currently set to, so
 * the page reads as a summary and opens only what you came to change. The two
 * list sections show their name alone: spelling out eight categories on a row
 * meant to be skimmed would defeat the point of rolling it up.
 *
 * The lists and the name are per account and follow you between devices. The
 * export folder cannot — see `exportFolder.ts` for why — so it says as much
 * on the section itself rather than leaving the difference to be discovered.
 */
export default function SettingsPage() {
  const { settings, loaded } = useSettings();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Settings</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Your profile, the lists the forms offer, and where exports go.
        </p>
      </header>

      {/* A failed settings save used to be reported here, and only here —
          which meant a save made from the verbs page or a table card failed
          silently. `StoreErrorBanner` in the workspace layout now shows it
          wherever it happens, so repeating it on this page would say the same
          thing twice. */}

      <div className="space-y-3">
        {/* Keyed on the stored name so a save, or a change in another tab,
            remounts the field with the new value — React’s way of resetting
            state from a prop without an effect that writes state. */}
        <ProfileSection
          key={settings.displayName}
          displayName={settings.displayName}
          loaded={loaded}
        />

        <PasswordSection />

        {/*
         * "Glossary Categories" rather than "Categories": the one list is
         * offered on the term form and the phrase form alike, and naming the
         * section after the tab those two share says so without spelling out
         * both.
         */}
        <SettingSection title="Glossary Categories">
          <NameListEditor
            legend="Glossary Categories"
            description={`The groups the term and phrase forms offer. One entry can still carry up to ${MAX_CATEGORIES} of them. Removing one here leaves it on anything already filed under it.`}
            names={settings.categories}
            onChange={(categories) => saveSettings({ categories })}
            placeholder="e.g. Travel"
          />
        </SettingSection>

        <SettingSection title="Sources">
          <NameListEditor
            legend="Sources"
            description="Where a definition came from. Shown on a word or phrase when you open it. The order you put them in is the order the form offers them, so the ones you use most belong at the top."
            names={settings.sources}
            onChange={(sources) => saveSettings({ sources })}
            minimum={1}
            placeholder="e.g. Textbook"
          />
        </SettingSection>

        <SettingSection title="Verb persons">
          <NameListEditor
            legend="Verb persons"
            description="The people a conjugation table is built from, in the order the rows should appear. Changing this shapes the next table you make; tables you already have keep the rows they were made with."
            names={settings.verbPersons}
            onChange={(verbPersons) => saveSettings({ verbPersons })}
            placeholder="e.g. ich"
          />
        </SettingSection>

        <SettingSection title="Verb tenses">
          <NameListEditor
            legend="Verb tenses"
            description="Offered when a conjugation table is made. A tense typed there is added here automatically; the order is the order the dropdown shows."
            names={settings.verbTenses}
            onChange={(verbTenses) => saveSettings({ verbTenses })}
            placeholder="e.g. Present"
          />
        </SettingSection>

        <ExportFolderSection />
      </div>
    </main>
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
function PasswordSection() {
  const [password, setPasswordDraft] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (password.length < MIN_PASSWORD) {
      setError(`A password needs at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setBusy(true);
    setError(null);
    const { error: failure } = await setPassword(password);
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }

    setPasswordDraft("");
    setConfirm("");
    setDone(true);
  }

  return (
    <SettingSection title="Password" summary="Sign in without waiting for an email">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Set a password and you can sign in as often as you like. Signing in by emailed link
        is limited to one a minute and a few an hour; a password is not limited at all.
      </p>

      <div className="mt-4 space-y-3">
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
            onChange={(event) => {
              setPasswordDraft(event.target.value);
              setDone(false);
              setError(null);
            }}
          />
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
            onChange={(event) => {
              setConfirm(event.target.value);
              setDone(false);
              setError(null);
            }}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}

        {done && (
          <p role="status" className="text-sm text-green-700 dark:text-green-400">
            Password saved. Use it with your email address next time you sign in.
          </p>
        )}

        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || !password || !confirm}
          onClick={() => void save()}
        >
          {busy ? "Saving…" : "Save password"}
        </button>
      </div>
    </SettingSection>
  );
}

/* ----------------------------------------------------------- export folder */

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
          href="/terms"
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
