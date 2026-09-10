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
import { signOut } from "@/lib/session";
import { clearError, saveSettings } from "@/lib/settings";
import { useExportFolder } from "@/lib/useExportFolder";
import { useSession } from "@/lib/useSession";
import { useSettings } from "@/lib/useSettings";

/**
 * Settings: who you are, the two lists the term form offers, and where
 * exports are written. Reached from the account menu rather than the main
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
  const { settings, loaded, error } = useSettings();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Settings</h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Your profile, the lists the term form offers, and where exports go.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={clearError}
            className="cursor-pointer font-medium underline"
          >
            Dismiss
          </button>
        </p>
      )}

      <div className="space-y-3">
        {/* Keyed on the stored name so a save, or a change in another tab,
            remounts the field with the new value — React’s way of resetting
            state from a prop without an effect that writes state. */}
        <ProfileSection
          key={settings.displayName}
          displayName={settings.displayName}
          loaded={loaded}
        />

        <SettingSection title="Categories">
          <NameListEditor
            legend="Categories"
            description={`The groups the term form offers. A term can still carry up to ${MAX_CATEGORIES} of them. Removing one here leaves it on any term already filed under it.`}
            names={settings.categories}
            onChange={(categories) => saveSettings({ categories })}
            placeholder="e.g. Grammar"
          />
        </SettingSection>

        <SettingSection title="Sources">
          <NameListEditor
            legend="Sources"
            description="Where a definition came from. The Source column sorts by this order, so the order you put them in is the order the list uses — not alphabetical."
            names={settings.sources}
            onChange={(sources) => saveSettings({ sources })}
            minimum={1}
            placeholder="e.g. Textbook"
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
    <SettingSection title="Profile" summary={displayName || user?.email || "—"}>
      <dl>
        <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
          Signed in as
        </dt>
        <dd className="mt-1 text-sm break-words">{user?.email ?? "—"}</dd>
      </dl>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Sign-in is a one-time emailed link, so there is no password to change
        here. The address itself is the account.
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
          href="/"
          className="text-indigo-700 underline underline-offset-2 dark:text-indigo-300"
        >
          Export
        </Link>{" "}
        writes its files. The Excel workbook and the JSON backup both go here,
        and their names do not change. This one is remembered for this browser
        only — a folder cannot follow an account to another machine.
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
          own download folder — change that in the browser&rsquo;s settings.
          Choosing a folder here works in Chrome and Edge.
        </p>
      )}
    </SettingSection>
  );
}
