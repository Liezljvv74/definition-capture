# Definition Capture

A small, local-only personal glossary for saving terms and concepts worth remembering.
Everything lives in your browser — no server, no database, no accounts.

## Running it

```bash
npm install     # first time only
npm run dev
```

Then open <http://localhost:3000>.

## Where the data lives

Entries are persisted in the browser's **`localStorage`**, under the key
`definition-capture.entries.v1`. The glossary is a small, single-user, plain-text list that
only has to survive a full page reload, so localStorage gives exactly that with synchronous
reads and zero setup.

Every read and write goes through `src/lib/storage.ts` — nothing else in the app touches
`localStorage` directly, so swapping in IndexedDB or a real API later means rewriting that one
file. Because the data is per-browser, entries saved in Chrome will not show up in Firefox, and
a `/terms/…` link only opens on the device that created it.

## What an entry holds

| Field | Notes |
| --- | --- |
| **Term** | Required, plain text. |
| **Definition** | Optional — leave it blank and fill it in later. |
| **Module / Tag** | Dropdown, defaults to `Unsorted`. |
| **Source** | Dropdown (Manual / Google / Claude / ChatGPT), defaults to `Manual`. |
| **Date Added** | Set once on creation, shown but never editable. |
| **Needs Definition** | Derived automatically — true whenever the definition is blank. |

To change the dropdown options, edit **`src/lib/constants.ts`**. Both forms and the module
filter read from those two lists.

## Pages

- **`/`** — the glossary browser. Search across terms and definitions, filter by module, show
  only entries that still need a definition, and re-sort by Term, Module, Source, or Date
  Added (newest first by default). A table on laptops, cards on phones. Rows that need a
  definition are flagged in amber.
- **`/terms/[id]`** — one entry per stable URL, safe to reload or paste into a fresh tab.
  Offers Edit (in place; Date Added is preserved) and Delete behind a confirm step. An unknown
  ID shows a readable "term not found" message rather than an error page.

## Backup: export and import

Because entries live in one browser, **Export** and **Import** sit at the top right of every
screen so you always have a way out.

- **Export** downloads the whole glossary as `definition-capture-backup-YYYY-MM-DD.json`. It is
  plain, readable JSON — `{ format, version, exportedAt, entries }` — safe to keep in a cloud
  folder or commit somewhere. The button is disabled while the glossary is empty.
- **Import** reads a backup back in. It first shows you what is in the file — how many terms are
  new, how many you already have, and how many rows it could not read — then asks what to do:

  | Mode | Effect |
  | --- | --- |
  | Add only the terms I don't have | Default. New terms are added, existing ones untouched. |
  | Add new terms and update matching ones | The backup's definitions overwrite yours. |
  | Replace my whole glossary | Everything saved is deleted first — behind a second confirm. |

Matching uses the same case-insensitive term rule as the add form. Imported entries keep their
original **Date Added**, which is the point of a backup, and IDs that would collide with an
existing entry are quietly re-issued so nothing is overwritten by accident. A bare array of
entries is accepted as well as a full backup file, and anything unreadable is reported rather
than silently dropped.

## Handy behaviors

- **Paste-to-split.** Pasting `term: definition` or `term - definition` into the Term field
  splits it across both fields. It only fills Definition when that field is still empty, and
  leaves URLs and long sentences alone.
- **Duplicate check.** Saving a term that already exists (case-insensitively) asks whether to
  update the existing entry or keep both — it never duplicates silently.
- **Two tabs stay in sync.** Adding an entry in one tab updates any other open tab.

## Layout of the code

```
src/
  app/
    page.tsx              glossary browser
    terms/[id]/page.tsx   entry detail, edit, delete
    layout.tsx            shell + metadata
    globals.css           Tailwind theme and shared control styles
  components/
    AddTermDialog.tsx     add flow, including the duplicate prompt
    BackupButtons.tsx     export / import buttons and the import dialog
    EntryForm.tsx         shared add/edit form
    Modal.tsx             overlay panel
    Badges.tsx            module / source / needs-definition pills
  lib/
    constants.ts          the editable dropdown lists
    types.ts              Entry shape and validators
    storage.ts            the only module that touches localStorage
    backupFile.ts         download / file-read plumbing for backups
    useGlossary.ts        React binding for the store
    parseTerm.ts          the paste-to-split rule
    format.ts             date formatting
```

Built with Next.js (App Router), TypeScript, and Tailwind CSS.
