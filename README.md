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

Both lists are persisted in the browser's **`localStorage`**, under
`definition-capture.entries.v1` and `definition-capture.phrases.v1`. Each is a small,
single-user, plain-text collection that only has to survive a full page reload, so
localStorage gives exactly that with synchronous reads and zero setup.

The two stores are built from one factory in `src/lib/browserStore.ts` — nothing else in the
app touches `localStorage` directly, so swapping in IndexedDB or a real API later means
rewriting that one file, and the lists cannot drift apart in how they load, save, or sync
between tabs. Because the data is per-browser, entries saved in Chrome will not show up in Firefox, and
a `/terms/…` link only opens on the device that created it.

## What an entry holds

| Field | Notes |
| --- | --- |
| **Term** | Required, plain text. |
| **Definition** | Optional — leave it blank and fill it in later. |
| **Ref** | Optional free text that links itself — see below. |
| **Source** | Dropdown (Manual / Google / Claude / ChatGPT), defaults to `Manual`. |
| **Date Added** | Set once on creation, shown but never editable. |
| **Needs Definition** | Derived automatically — true whenever the definition is blank. |

To change the Source options, edit **`src/lib/constants.ts`** — the add and edit forms both
read from that list.

## Pages

- **`/`** — the glossary browser. Columns are Term, Definition, Source, and Ref. Search across
  terms and definitions, show only entries that still need a definition, and re-sort by Term or
  Source. A table on laptops, cards on phones. Rows that need a definition are flagged in amber.
  Date Added is not a column — the list is ordered newest-first underneath, and the date itself
  is shown on the entry's own page.
- **`/terms/[id]`** — one entry per stable URL, safe to reload or paste into a fresh tab.
  **Source** is a dropdown here that saves the moment you change it; everything else goes
  through Edit (in place; Date Added is preserved). Delete sits behind a confirm step. An
  unknown ID shows a readable "term not found" message rather than an error page.

- **`/phrases`** — the phrase list: a separate store that mirrors the glossary, for multi-word
  expressions that do not fit a single term. Columns are **Phrase**, **Literal meaning**,
  **Usage example**, and **Ref** — no dates, since phrases are looked up by wording rather
  than by when they were captured. Search covers all four fields, the Phrase column sorts
  A→Z / Z→A / back to newest-first, and only Phrase is required.
- **`/phrases/[id]`** — one phrase per stable URL, with Edit and a confirmed Delete, the same
  as a term.

A thin nav bar at the top of every page switches between Glossary and Phrases.

Selecting a term in the glossary links to `/terms/[id]?edit=1`, which opens that entry with the
**Edit term** form already showing — the common case is arriving to fix or finish something.
Saving or cancelling drops the `?edit=1` and leaves you on the read-only entry, and the bare
`/terms/[id]` URL (what a `[[Term]]` reference points at) always opens read-only.

Dates are shown short — `01 Sep 2026`, no clock time. Hovering shows the exact timestamp, and
sorting always uses the full stored value, so two terms added on the same day still order
correctly.

## The Ref field

Ref is free text, so a note like `Lecture 4, page 12` is perfectly valid. On top of that, four
patterns are recognised and turned into links, and you can mix them with ordinary words in one
field:

| Write | Links to |
| --- | --- |
| `[[Closure]]` | Whatever is saved under that name — a term **or** a phrase, since the two share one namespace. A name that matches nothing is shown plainly rather than as a dead link. |
| `/terms/abc123`, `/` | A page inside this app. |
| `https://example.com/docs` | Any web page — opens in a new tab. The scheme is hidden in the display so the column stays readable. |
| `#definition` | A spot on the page you are already on. |

Wrapping punctuation is handled, so `(https://example.com).` links only the URL. Ref is
searchable along with the other fields on both lists, and it is included in backups.

## Backup: export and import

Because entries live in one browser, **Export** and **Import** sit at the top right of every
screen so you always have a way out.

- **Export** downloads **both lists** as `definition-capture-backup-YYYY-MM-DD.json` — one
  file, nothing to remember separately. It is plain, readable JSON —
  `{ format, version, exportedAt, entries, phrases }` — safe to keep in a cloud folder or
  commit somewhere. The button is disabled while there is nothing saved.
- **Import** reads a backup back in. It first shows you what is in the file — how many terms are
  new, how many you already have, and how many rows it could not read — then asks what to do:

  | Mode | Effect |
  | --- | --- |
  | Add only the terms I don't have | Default. New terms are added, existing ones untouched. |
  | Add new terms and update matching ones | The backup's definitions overwrite yours. |
  | Replace my whole glossary | Everything saved is deleted first — behind a second confirm. |

Terms match on the term, phrases on the phrase, both case-insensitively — the same rule the add
forms use. Imported entries keep their original **Date Added**, which is the point of a backup,
and IDs that would collide are quietly re-issued so nothing is overwritten by accident.

Older backups still work: a version 1 file (terms only) imports fine, as does a bare array of
entries. Restoring a terms-only backup with **Replace** deliberately leaves the phrase list
alone rather than silently deleting it. Anything unreadable is counted and reported rather than
silently dropped.

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
    phrases/page.tsx      phrase list
    phrases/[id]/page.tsx phrase detail, edit, delete
    layout.tsx            shell + metadata
    globals.css           Tailwind theme and shared control styles
  components/
    AddPhraseDialog.tsx   add-phrase flow, including the duplicate prompt
    AddTermDialog.tsx     add-term flow, including the duplicate prompt
    BackupButtons.tsx     export / import buttons and the import dialog
    EntryForm.tsx         shared add/edit form for terms
    PhraseForm.tsx        shared add/edit form for phrases
    MainNav.tsx           Glossary / Phrases nav bar
    Modal.tsx             overlay panel
    Badges.tsx            source / needs-definition pills
    RefText.tsx           renders a parsed Ref value
  lib/
    browserStore.ts       the localStorage factory both stores are built on
    constants.ts          the editable dropdown lists
    types.ts              Entry and Phrase shapes plus validators
    storage.ts            the glossary store
    phraseStorage.ts      the phrase store
    backup.ts             one backup file covering both lists
    backupFile.ts         download / file-read plumbing for backups
    useGlossary.ts        React binding for the glossary store
    usePhrases.ts         React binding for the phrase store
    parseTerm.ts          the paste-to-split rule
    parseRef.ts           turns a Ref value into text and link tokens
    format.ts             date formatting
```

Built with Next.js (App Router), TypeScript, and Tailwind CSS.
