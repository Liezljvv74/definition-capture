# Definition Capture

A small, local-only personal glossary for saving terms and concepts worth remembering.
Everything lives in your browser — no server, no database, no accounts.

## Running it

Double-click **`start-app.cmd`**. It installs dependencies the first time, starts the dev
server, and opens the browser for you. Keep the window open while you use the app; closing it
stops the server. If the app is already running it just opens the browser again.

Or from a terminal:

```bash
npm install     # first time only
npm run dev
```

Then open <http://localhost:3001>.

The port is fixed at 3001 on purpose. `localStorage` is keyed to the exact origin, so starting
on any other port would open the app with an empty list. The dev server also accepts requests
from `192.168.0.11`, which lets a phone on the same router load it — that address is
DHCP-assigned, so re-check it in `next.config.ts` if the router reassigns.

## Where the data lives

Both lists are persisted in the browser's **`localStorage`**, under
`definition-capture.entries.v1` and `definition-capture.phrases.v1`. Each is a small,
single-user, plain-text collection that only has to survive a full page reload, so
localStorage gives exactly that with synchronous reads and zero setup.

The two stores are built from one factory in `src/lib/browserStore.ts` — nothing else in the
app touches `localStorage` directly, so swapping in IndexedDB or a real API later means
rewriting that one file, and the lists cannot drift apart in how they load, save, or sync
between tabs. Because the data is per-browser, entries saved in Chrome will not show up in
Firefox, and a `/term?id=…` link only opens on the device that created it.

## What an entry holds

| Field | Notes |
| --- | --- |
| **Term** | Required, plain text. |
| **Definition** | Optional — leave it blank and fill it in later. |
| **Ref** | Optional free text that links itself — see below. |
| **Source** | Dropdown (Manual / Google / Claude / ChatGPT), defaults to `Manual`. |
| **Date Added** | Set once on creation, never editable. |
| **Date Updated** | Set on every save, shown on the term's own page as "Edited …". Null until the first edit. |
| **Needs Definition** | Derived automatically — true whenever the definition is blank. |

To change the Source options, edit **`src/lib/constants.ts`** — the add and edit forms both
read from that list.

## Pages

- **`/`** — the glossary browser, and the page that owns adding, editing, and deleting terms.
  Columns are Term, Definition, Source, and Ref. Search covers terms, definitions, and refs;
  a "Needs definition" checkbox narrows to unfinished entries; the Term and Source headers
  re-sort. A table on laptops, cards on phones. Rows that need a definition are flagged in
  amber. Date Added is not a column — the list is ordered newest-first underneath, and the
  date itself is shown on the entry's own page.
- **`/phrases`** — the phrase list: a separate store that mirrors the glossary, for multi-word
  expressions that do not fit a single term. Columns are **Phrase**, **Literal meaning**,
  **Usage example**, and **Ref** — no dates, since phrases are looked up by wording rather
  than by when they were captured. Search covers all four fields, the Phrase header cycles
  A→Z / Z→A / back to newest-first, and only Phrase is required.
- **`/term?id=…`** and **`/phrase?id=…`** — one item per stable URL, safe to reload or paste
  into a fresh tab. This is where a `[[Name]]` reference lands. Both pages read: they show the
  full untruncated text plus, for a term, its Source badge and dates, and offer **Edit** so a
  cross-link onto a typo can be fixed on the spot. Saving from here returns you to the list.
  Deleting is not offered — the lists own that. An unknown ID shows a readable "not found"
  message rather than an error page.

The id is a query parameter rather than a path segment because the app is exported as static
HTML (see Deploying): the ids only exist in each visitor's browser, so a `/terms/[id]` route
would have nothing to pre-render at build time. One static page that reads the id at runtime
works everywhere.

A thin nav bar at the top of every page carries the Captured logo in the top left corner — it
links home — and switches between Glossary and Phrases.

The same logo sits behind the app as a backdrop, shaded 70%: the artwork is laid over the page
colour at 30% strength, which is the same thing as covering it with 70% of that colour but in
one layer instead of two. It is fixed rather than scrolling, so a long list slides over a still
backdrop, and the cards and headers above it stay opaque so every table row keeps full
contrast — the logo shows through the page margins. `--logo-shade` in the `PageBackground`
component in `src/app/layout.tsx` is the only number to change: raise it to fade the logo
further, lower it to bring the artwork forward.

Dates are shown short — `01 Sep 2026`, no clock time. Hovering shows the exact timestamp, and
sorting always uses the full stored value, so two terms added on the same day still order
correctly.

## Adding, editing, and deleting

Everything happens on the list pages, in a dialog, without navigating away.

- **Add** — the **Add term** / **Add phrase** button at the top right.
- **Edit** — select the term or phrase itself in the list. Every editable field lives in that
  one form, Source included; Date Added is preserved. Renaming onto a name another entry
  already uses is refused rather than leaving two identical entries.
- **Delete one** — the trash button at the end of the row, behind a confirmation.
- **Delete several** — tick the checkboxes (or the select-all box in the header), then use
  **Delete selected** in the bar that appears. The confirmation names what is about to go, up
  to six of them, then "…and N more".

Selection is always intersected with what is on screen, so a row you filter away leaves the
selection on its own — "Delete selected" can only ever delete rows you can actually see.

## The Ref field

Ref is free text, so a note like `Lecture 4, page 12` is perfectly valid. On top of that, five
patterns are recognised and turned into links, and you can mix them with ordinary words in one
field:

| Write | Links to |
| --- | --- |
| `[[Closure]]` | Whatever is saved under that name — a term **or** a phrase, since the two share one namespace. Terms win a name clash. A name that matches nothing is shown plainly rather than as a dead link. |
| `/term?id=abc123`, `/` | A page inside this app. |
| `https://example.com/docs` | Any web page — opens in a new tab. The scheme is hidden in the display so the column stays readable. |
| `www.example.com` | The same, with `https://` assumed. |
| `#definition` | A spot on the page you are already on. |

Wrapping punctuation is handled, so `(https://example.com).` links only the URL. Ref is
searchable along with the other fields on both lists, and it is included in backups.

## Backup: export and import

Because entries live in one browser, **Export** and **Import** sit at the top right of every
screen so you always have a way out.

- **Export** asks two things: how much, and in what format.

  **How much** — *Everything* (both lists), or *Only this page*, which means Phrases while you
  are on the phrase list or a single phrase, and the Glossary everywhere else. The file name
  records the choice:
  `definition-capture-backup-…`, `-terms-…`, or `-phrases-…`.

  **What format** — either one covers whatever you chose above, in a single file:

  | Format | What you get |
  | --- | --- |
  | **Excel workbook** (`.xlsx`) | One sheet per exported list — Terms and Phrases when you export everything — with bold headers and sensible column widths. For reading, sorting, or printing outside the app. |
  | **JSON backup** (`.json`) | `{ format, version, exportedAt, entries, phrases }` — plain, readable, and **the only format Import can read back in**. |

  The button is disabled while there is nothing saved. The workbook is built in the browser by
  [`write-excel-file`](https://www.npmjs.com/package/write-excel-file), the app's one runtime
  dependency beyond Next and React.
- **Import** reads a backup back in. It first shows you what is in the file — how many items
  are new, how many you already have, and how many rows it could not read — then asks what to
  do:

  | Mode | Effect |
  | --- | --- |
  | Add only what I don't have | Default. New items are added, existing ones untouched. |
  | Add new and update matching | The backup overwrites what you have. |
  | Replace everything with this backup | What is saved now is deleted first — behind a second confirm. |

Terms match on the term, phrases on the phrase, both case-insensitively — the same rule the add
forms use. Imported entries keep their original **Date Added**, which is the point of a backup,
and IDs that would collide are quietly re-issued so nothing is overwritten by accident.

Older backups still work: a version 1 file (terms only) imports fine, as does a bare array of
entries. **Replace never wipes a list the file carries nothing for** — restoring a terms-only
export leaves your phrases alone, and a phrases-only export leaves your terms alone. The
confirmation spells out, per list, what will be deleted and what will be left as it is.
Anything unreadable is counted and reported rather than silently dropped.

## Handy behaviors

- **Paste-to-split.** Pasting `term: definition` or `term - definition` into the Term field
  splits it across both fields. It only fills Definition when that field is still empty, and
  leaves URLs and long sentences alone.
- **Duplicate check.** Saving a term that already exists (case-insensitively) asks whether to
  update the existing entry or keep both — it never duplicates silently.
- **Two tabs stay in sync.** Adding an entry in one tab updates any other open tab.

## Deploying

The app is a static export — `output: "export"` in `next.config.ts` — because everything is
client-side already, so there is nothing for a Node server to do. `npm run build` writes plain
HTML, CSS, and JS into `out/`, which is committed so the built site is always in the project.

`.github/workflows/deploy.yml` publishes to GitHub Pages on every push to `main`, and can be
re-run by hand from the Actions tab. The live site is
<https://liezljvv74.github.io/definition-capture/>.

That build sets `GITHUB_PAGES=true`, which switches on the `/definition-capture` basePath — a
project site is served from `https://<user>.github.io/<repo>/`, not the domain root, and
without it every stylesheet and script would 404. The same flag fills in
`NEXT_PUBLIC_BASE_PATH`, which is what `asset()` reads to prefix the two logo files, since Next
rewrites a `<Link href>` for the basePath but not an image or `background-image` URL. Local
builds leave the flag unset and keep serving from `/`.

A deployed copy is still per-browser: it is the same app, with its own empty localStorage.

## Layout of the code

```
src/
  app/
    page.tsx              glossary browser: add, edit, delete, search, sort
    phrases/page.tsx      phrase list, the same shape as the glossary
    term/page.tsx         one term by ?id=, read-only plus Edit
    phrase/page.tsx       one phrase by ?id=, read-only plus Edit
    layout.tsx            shell, metadata, and the shaded logo backdrop
    globals.css           Tailwind theme and shared control styles
  components/
    AddTermDialog.tsx     add-term flow, including the duplicate prompt
    AddPhraseDialog.tsx   add-phrase flow, including the duplicate prompt
    EditTermDialog.tsx    edit-term flow, including the rename clash
    EditPhraseDialog.tsx  edit-phrase flow
    DeleteControls.tsx    checkboxes, selection bar, and the delete confirmation
    BackupButtons.tsx     export / import buttons and their dialogs
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
    backupFile.ts         download plumbing: builds the .xlsx and .json files
    useGlossary.ts        React binding for the glossary store
    usePhrases.ts         React binding for the phrase store
    useListSelection.ts   row selection shared by both list pages
    parseTerm.ts          the paste-to-split rule
    parseRef.ts           turns a Ref value into text and link tokens
    format.ts             date formatting
    assetPath.ts          prefixes public/ URLs with the basePath
assets/
  captured-logo.png       the full-size logo artwork, not served
public/
  captured-logo.png       the 256px copy the nav bar loads
  captured-logo-bg.png    the 1000px copy the backdrop loads
```

`assets/` holds source art that is not served; `public/` holds what the browser downloads, so
the logo is kept there at the size it is actually shown rather than at full resolution. Because
`next/image` does not rewrite an image `src` for the basePath and a static export has no
optimiser behind it, the nav uses a plain `<img>` whose URL goes through `asset()`.

Built with Next.js (App Router), TypeScript, and Tailwind CSS.
