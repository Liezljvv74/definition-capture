# Definition Capture

Definition Capture is a personal language-learning workspace for saving words,
phrases and verb conjugations, then returning to them with structured review and
flashcards.

It was designed to bring scattered study notes into one place so learning feels
clearer, more organised and easier to revisit over time. It is built for language
learners who want a lightweight system for collecting vocabulary, reviewing
phrases and keeping conjugation patterns in view without losing track of what
they already know.

![The home page: the Glossary, Verbs and Backup tabs above a welcome panel, cards for Vocabulary, Phrases and Verbs, and the Own your progress card with its Create flashcards button](AppScreenshot.JPG)

## Why this app exists

Learners collect useful words and phrases in many places, and those notes are
hardest to use when they are scattered. Definition Capture brings them into a
single private workspace with structured review, clear filtering and quick
recall.

It is meant for:

- self-directed language learners
- students working through online courses
- anyone who wants a simple, private vocabulary and phrase log
- anyone who wants to turn what they have saved into flashcards

## Product overview

The app gives one signed-in person a place to:

- save vocabulary and phrase entries
- organise them by category and source
- revisit any one of them from a stable link
- build flashcard decks from chosen sources and filters
- see which items need another look
- keep all of it private to their own account

Everything is stored in Supabase and scoped to the account that saved it. Sign in
on another browser or device and the same lists are there.

## Core features

- **Vocabulary**: words, definitions, references, categories and sources, with
  search, category filters, sorting, and a flag for entries whose definition is
  still to be written.
- **Phrases**: expressions and example usage, kept as their own list so a phrase
  does not have to pretend to be a word.
- **Verb tables**: a conjugation table per verb, with a column per tense and a
  row per person, and a note against any row.
- **Flashcards**: a deck built from chosen sources and filters, one card at a
  time, with the typed answer marked and the schedule updated from what happened.
- **Backup**: export everything, or one list, as JSON or as an Excel workbook,
  and import a backup again without disturbing the lists the file says nothing
  about.
- **Accounts**: Supabase Auth for sign-in, sign-up and password reset, with
  every protected page checked on the server before it renders.

## Tech stack

| | |
| --- | --- |
| Framework | Next.js 16.3.4, App Router, Turbopack |
| UI | React 19.2.8, TypeScript 5, Tailwind CSS 4 |
| Data and auth | Supabase: Postgres with row level security, and Supabase Auth |
| Supabase clients | `@supabase/ssr` (browser and server), `@supabase/supabase-js` |
| Exports | `write-excel-file`, imported on demand |
| Tests | Vitest 3, in the node environment |

## Running it

Double-click **`start-app.cmd`**. It installs dependencies the first time, starts
the dev server and opens the browser. Keep the window open while you use the app;
closing it stops the server.

Or from a terminal:

```bash
npm install     # first time only
npm run dev
```

Then open <http://localhost:3000>.

Either way you need a `.env.local` first. Copy `.env.example` and fill in the two
values from your Supabase project, both of which are found under Project Settings
→ API in the dashboard:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
```

Both are compiled into the browser bundle and are meant to be public; row level
security is what protects the data behind them. Without them the app still builds
and runs, but says so instead of showing a sign-in form.

The port is fixed at 3000 on purpose: a sign-in link only returns to a URL
Supabase has been told to accept, and `http://localhost:3000/auth/callback` is
one of the two registered. The dev server also accepts requests from any
`192.168.0.x` address, which lets a phone on the same router load it. Change the
pattern in `next.config.ts` if your router uses a different range.

## Setting up Supabase

One project holds every table. From a clean checkout:

```bash
npx supabase login                              # opens a browser; needs a real terminal
npx supabase link --project-ref <your-ref>      # the ref is in the dashboard URL
npx supabase db push                            # applies supabase/migrations/
```

Then, in the dashboard:

- **Project Settings → API**: copy the project URL and the publishable key into
  `.env.local`.
- **Authentication → URL Configuration → Redirect URLs**: add both
  `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/reset`.
  The first trades a link's `?code=` for a session and is where sign-in links and
  sign-up confirmations come back to; the second does the same for a password
  reset and then sends the reader to the form for choosing one. A link returning
  to an unlisted URL is silently sent to the site root instead, which looks
  exactly like a broken link, so a missing second entry shows up as "the reset
  link did nothing".

### Accounts, sign-in and passwords

Anyone without an account can make one at **`/sign-up`** with an email and a
password. If the project requires email confirmation the account waits until the
address is confirmed, and the screen says so. Either way the screen never states
that an account was created, because Supabase answers an address that already has
one exactly as it answers a new one, deliberately, so the form cannot be used to
discover who has an account.

Sign-in is an email and password, checked by Supabase. No password is stored,
compared or hashed by this app. An emailed one-time link is offered as a second
route, and is how an account gets created in the first place: Supabase makes the
account on the first link it sends.

**Forgot your password?** on the sign-in screen emails a link that signs you in
and lands on **`/choose-password`**, a form that asks for the new password and
nothing else. The link is the proof: somebody who can read the account's email is
who the account belongs to, which is the same claim the sign-in links rest on. It
answers the same way whether or not the address has an account, because a screen
that said "no account with that address" would be a way of finding out who has
one. Choosing a password there signs out every other session.

**Settings → Password** changes the password and asks for the current one first,
because a session may be a browser somebody walked away from. A reader who cannot
give it, including anyone whose account has only ever been used through an
emailed link, can send themselves the same reset link from that section.

The built-in email sender is rate limited twice over: a few messages an hour in
total, and no more than one a minute to the same address. `email rate limit
exceeded` means one of those, not a broken configuration. A real SMTP provider
under **Authentication → Emails** lifts both, and is what to do before anyone else
uses this. A password has no such limit, which is why the sign-in screen offers it
first.

> Do not run `supabase config push` against this project. The local `config.toml`
> is largely defaults and differs from the hosted project in about a dozen places
> (`supabase config diff` lists them), so a push would also switch off email
> confirmations and MFA. Change auth settings in the dashboard.

`npx supabase migration new <name>` starts a new migration and `npx supabase db
push` applies it. `npx supabase db query -f query.sql --linked` runs a one-off
query against the hosted database, which is the quickest way to see what is really
in there. All three go over the network and need nothing installed locally.
`db pull`, `db dump` and `db diff` are the exceptions: each builds a throwaway
shadow database in a container, so without Docker or Podman they stop with
`docker: command not found`. Nothing in the normal workflow needs them: write the
migration by hand and push it.

`npx supabase login` opens a browser and waits for a keypress, so it only works in
a real terminal; inside an editor or agent shell it exits with `Cannot use
automatic login flow inside non-TTY environments`. Log in once in a terminal and
every other tool picks up the stored credentials.

## Authentication and session model

Being signed in is decided on the server, before a page exists.

`src/proxy.ts` runs ahead of every request. It refreshes the session cookies
(tokens expire hourly and a Server Component cannot write cookies) and redirects
anyone without a session to `/sign-in`. `src/app/(workspace)/layout.tsx` then asks
again, on the server, before any page inside the group renders. Two checks,
because one of them lives in a file whose matcher is easy to narrow by accident.

Both use `getClaims()`, never `getSession()`. A session read straight out of a
cookie is a claim made by whoever sent the request; `getClaims` verifies the
token's signature against the project's public keys before believing it. A forged
cookie is turned away exactly like no cookie at all.

The session lives in cookies, which is what makes the rest possible:
`createBrowserClient` from `@supabase/ssr` puts it there, so the server is handed
the same session the browser holds. That also allows **PKCE**: a sign-in link
comes back to `/auth/callback`, a route handler that trades its `?code=` for a
session on the server.

A link that has expired or has already been used comes back with an error in the
URL rather than a session. `src/lib/authLinkError.ts` reads it before anything
else can clear it, and the sign-in screen says so, because the alternative, an
unexplained form, invites asking for another link and there are not many to
spare. What it says is its own sentence, chosen by error code from a closed list:
repeating back whatever the URL carried would have let any link make this app say
anything in its own voice.

## Where the data lives

Every list is in Supabase. All three are views over a single `learning_items`
table: `words`, `phrases` and `verb_tables` are the names the application reads
and writes, and `instead of` triggers turn a write through one of them into a
write to the spine and the matching detail table. A `user_settings` row per
account holds what Settings manages.

That spine is what lets flashcards, review history and progress work across every
content type rather than one page at a time, and it is why adding a content type
later is a row in `item_types` and one detail table rather than a change to every
query. The design, and what it cost, is in [`Docs/schema.md`](Docs/schema.md). All
of its migrations are applied.

List queries run in the browser under the publishable key, which anyone can read
out of the bundle. That is what that key is for, but it means **row level security
is what separates one account's words from another's.** The policies in
`supabase/migrations/` are load-bearing, not decoration; every table has RLS
enabled. `learning_items` carries all four policies, select, insert, update and
delete, each checking `(select auth.uid()) = user_id`. The detail tables carry no
`user_id` of their own and reach through the shared primary key instead, so there
is one answer to who owns a row. `user_settings` has no delete policy, because a
settings row is created once and edited thereafter, and `review_logs` has only
select and insert, because a review that happened cannot later not have happened.

The three list stores are built from one factory in `src/lib/remoteStore.ts`, so
they cannot drift apart in how they load, save or report a failure. Two modules
read Supabase without it and both fail its premise rather than ignore it:
`src/lib/settings.ts` holds one row with no id and no order, and
`src/lib/flashcards.ts` asks for a deck that is played once and finished with.

Writes are optimistic: the screen updates first and the database follows. When a
write fails the store reloads the list so the screen shows what is really stored,
and `StoreErrorBanner` says what went wrong, because losing a write quietly would
be worse than a banner.

### Design principles behind the schema

- one shared identity for every kind of saved content
- review history append-only, so a summary can always be rebuilt from it
- progress summarised into its own row, so a dashboard is a read and not a scan
- per-type detail kept out of the shared table
- no raw content duplicated across tables

## The app, page by page

### Home

A welcome panel, a card for each of the three lists, and the pale blue **Own your
progress** card that opens the deck builder. Choosing a deck asks four things:
which sources to draw from, which categories to narrow to, whether to take only
items marked as needing review, and how many cards to build. The default is
everything, fifty cards.

### Vocabulary and Phrases

Together these are **Glossary**, one section with two pages. Vocabulary owns
adding, editing and deleting words; its columns are Word, Definition, Category and
Ref. Search covers words, definitions and refs, a category dropdown narrows to one
group, a "needs definition" checkbox narrows to unfinished entries, and the Word
and Definition headers re-sort. The list is alphabetical, and a leading `der`,
`die` or `das` is skipped when comparing, so a noun files under its own word. Rows
that still need a definition are flagged in amber. A table on laptops, cards on
phones.

Phrases mirrors that shape for multi-word expressions, with Phrase, Literal
Meaning, Usage Example, Category and Ref, and only Phrase required.

Clicking a name opens that item's own page rather than the edit form. Editing has
the pencil at the end of the row and the **Edit** button on the page itself.

### One word or one phrase

`/word?id=…` and `/phrase?id=…` give every item a stable link, safe to reload or
paste into a note. This is where a `[[Name]]` reference lands, and where a name
opens from either list. Both pages show the full untruncated text, the Source, the
date it was captured, and a Ref whose references can be followed. Deleting is not
offered; the lists own that. An unknown id shows a readable "not found" message
rather than an error page.

### Verbs

One conjugation table per verb, each rolled up to its verb until opened. Tables
are made from a word's Edit screen rather than here, which is what keeps a table's
name and its word identical: the two are matched by name, the way `[[Name]]` links
resolve. A table holds a column per tense and a row per person, with a note
available against any row.

### Flashcards

One card at a time from a deck built on the Home page. The front is the word,
phrase or verb, and you type what it means rather than deciding for yourself
whether you knew it.

A right answer flashes pale green and moves on by itself. A wrong one flashes pale
orange, ticks **needs review**, and waits, because there are three reasonable
things to do next: try again, see the answer, or move on. Each is recorded as a
different outcome, since "I looked it up" and "I gave up" are not the same thing
to have done. Answering correctly clears the flag again, so a card that has been
learned stops coming back; ticking or unticking the box yourself on a card stops
the app deciding for that one.

The marking ignores case, surrounding punctuation and stray spacing, and forgives
a typo in a long answer, but never an accent: `Tür` and `Tur` are different words.
Whatever is written on the back, typed out exactly, is always right. Where an
answer offers alternatives, any one of them will do: `gerne` means "gladly,
willingly", and somebody who types `gladly` knows the word. Which characters
separate alternatives is yours to set under **Settings → Flashcard settings**:
comma, slash, semicolon, pipe and brackets, any combination, or none at all.
Brackets also decide whether an aside is optional, so `to go (on foot)` can be
answered by `to go`.

Otherwise it is deliberately strict: being refused costs a button press, while
being wrongly told you knew something schedules it weeks away with nothing to
notice.

### Settings

Reached from the gear at the right of the nav, which opens a menu of three groups
rather than going straight to one page:

- **Profile**: the address you signed in with, an optional display name shown in
  the nav in its place, Sign out, **Password** (see above), and **Export folder**.
- **Glossary settings**: Glossary Categories and Sources, plus Verb persons and
  Verb tenses. Saving the category list also brings the flashcard filter's copy of
  it into line. A category removed here is deleted only if nothing is filed under
  it.
- **Flashcard settings**: which characters separate one acceptable answer from the
  next.

Which group is showing is a `?section=` query parameter, so a group can be linked
to and survives a reload, and anything unrecognised falls back to Profile.

### Choosing a password

`/choose-password` is where a reset link lands, already signed in. New password,
confirm, save, and no old password asked for, because following the link is the
proof. It sits inside the workspace group like every other page, so arriving
without a session sends you to sign in.

## The Ref field

Ref is free text, so a note like `Lecture 4, page 12` is perfectly valid. On top of
that, five patterns are recognised and turned into links, and they can be mixed
with ordinary words in one field:

| Write | Links to |
| --- | --- |
| `[[Closure]]` | Whatever is saved under that name, a word **or** a phrase, since the two share one namespace. Words win a name clash. **You do not type this form.** Start typing a saved name and the field offers it; picking one writes the brackets for you. |
| `/word?id=abc123`, `/` | A page inside this app. |
| `https://example.com/docs` | Any web page, opened in a new tab. The scheme is hidden in the display so the column stays readable. |
| `www.example.com` | The same, with `https://` assumed. |
| `#definition` | A spot on the page you are already on. |

Wrapping punctuation is handled, so `(https://example.com).` links only the URL.
Ref is searchable along with the other fields, and it is included in backups.

## Adding, editing and deleting

Everything happens on the list pages, in a dialog, without navigating away.

- **Add**: the **Add word** or **Add phrase** button at the top right.
- **Edit**: the pencil at the end of the row, or **Edit** on the item's own page.
  Every editable field lives in that one form, Source included, and Date Added is
  preserved. Renaming onto a name another entry already uses is refused rather
  than leaving two identical entries.
- **Delete one**: the trash button at the end of the row, behind a confirmation.
- **Delete several**: tick the checkboxes, or the select-all box in the header,
  then use **Delete selected** in the bar that appears. The confirmation names
  what is about to go, up to six of them, then "…and N more". Filtering clears the
  selection on its own, so "Delete selected" can only ever delete rows you can
  actually see.

## Backup: export and import

**Export** and **Import** live under **Backup** in the nav bar, so there is always
a copy you hold yourself and a way out of the app entirely.

By default an export goes wherever the browser puts downloads. **Settings → Export
folder** lets you pick a folder instead, and both formats then write straight into
it. The choice is remembered per browser rather than per account, because a folder
is granted to one browser on one machine as a handle that cannot be written down
as text. Only Chromium browsers can offer it at all; elsewhere the Settings page
says so and exports keep going to the download folder.

- **Export** asks two things: how much, and in what format.

  **How much**: *Everything*, or one list named outright, each shown with how many
  it holds. The file name records the choice.

  **What format**:

  | Format | What you get |
  | --- | --- |
  | **Excel workbook** (`.xlsx`) | One sheet per exported list, with bold headers and sensible column widths. A conjugation table is flattened to one row per person per tense, since a sheet is a flat list and a table is a grid. For reading, sorting or printing outside the app. |
  | **JSON backup** (`.json`) | `{ format, version, exportedAt, words, phrases, verbTables, settings }`, which is plain, readable and **the only format Import can read back in**. Each list is written through its own codec, so the file format is a declared shape rather than whatever the app happens to hold in memory. |

- **Import** reads a backup back in. It first shows what is in the file: how many
  items are new, how many you already have, and how many rows it could not read.
  Then it asks what to do:

  | Mode | Effect |
  | --- | --- |
  | Add only what I don't have | Default. New items are added, existing ones untouched. |
  | Add new and update matching | The backup overwrites what you have. |
  | Replace everything with this backup | What is saved now is deleted first, behind a second confirm. |

Words match on the word, phrases on the phrase, verb tables on the verb, all
case-insensitively, the same rule the add forms use. Imported entries keep their
original **Date Added**, which is the point of a backup, and ids that would collide
are quietly re-issued so nothing is overwritten by accident.

Older backups still work, and that is tested rather than hoped for: a version 1
file imports fine, as does a bare array of entries, and so does anything written
before the glossary was renamed, since those files call the list `entries` and the
field `term` and the reader accepts either spelling. Two fields arrived with
version 8, and a file without them is not treated as a file that says no: a phrase
with no date recorded is given today's, and a settings block with no answer
separators restores the defaults rather than switching the marking rules off.
**Replace never wipes a list the file carries nothing for**: restoring a
words-only export leaves your phrases and verb tables alone. Anything unreadable is
counted and reported rather than silently dropped.

## Handy behaviours

- **Paste-to-split.** Pasting `word: definition` or `word - definition` into the
  Word field splits it across both fields. It only fills Definition when that field
  is still empty, and leaves URLs and long sentences alone.
- **Duplicate check.** A word is saved once. Saving one that already exists
  (case-insensitively) offers to update it, or to go back and change the wording.
  There is no "keep both", because there cannot be: a partial unique index on
  `(user_id, lower(title)) where item_type = 'word'` refuses a second, and
  `[[Name]]` links, the duplicate check itself and import matching all resolve a
  name to exactly one entry. Phrases work the same way under an index of their own,
  which is why a word and a phrase may share a name while two words may not.
- **Tabs catch up when you look at them.** Switching to another tab, or back to the
  window, re-reads whichever lists the page you are on is showing, so a word added
  elsewhere is there when you look. It is not live sync: a second tab sitting
  visible next to the first will not update until it is focused.

## Usability notes

What the app does well:

- a small number of clear learning tasks, and a navigation bar that stays out of
  the way
- actions close to the content they affect, and dialogs rather than page changes
- flashcards that fit into the same loop as saving and reviewing
- search, filters and review reachable without hunting

What would repay attention next:

- onboarding for a first visit, which currently shows empty lists and little else
- a plainer explanation of how a deck is built, on the Home page rather than in
  the dialog
- richer progress summaries, now that the data behind them exists
- saying how mastery is worked out, where the reader can see it

## Checking the code

```bash
npx tsc --noEmit     # types
npx eslint src/      # lint
npx vitest run       # 27 suites, node environment, no jsdom and no browser
npm run build        # when routing or rendering changed
```

The build is worth running for its route table rather than for the bundle: it
prints which routes are static and which are server-rendered, which is how a
protected page is confirmed to still be dynamic. Every route but `/sign-in` and
`/sign-up` should be marked `ƒ`.

The tests run in node and render components to a string where they need markup at
all, so there is no jsdom to configure and no browser to drive. What they cover is
chosen rather than uniform: the paths that can lose data quietly, such as importing
a backup, writing through the store, and deciding whether a typed answer is right.
Several were checked by breaking the code on purpose and confirming they noticed.

## Deploying

**Not deployed at the moment, and that is deliberate.**

This app needs a host that runs Node, so that `src/proxy.ts` and the server
components actually execute. Whatever it is will need `NEXT_PUBLIC_SUPABASE_URL`
and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in its build environment, and its origin
added to **Authentication → URL Configuration → Redirect URLs** in the Supabase
dashboard, as both `<origin>/auth/callback` and `<origin>/auth/reset`.

A deployed copy is the same list: sign in there and your words are the ones you
saved in the same Supabase project.

## Layout of the code

```
src/
  proxy.ts                verifies the session before any page is rendered
  app/
    layout.tsx            shell, metadata, and the shaded logo backdrop
    globals.css           Tailwind theme and shared control styles
    sign-in/page.tsx      a password, an emailed link, or a reset link
    sign-up/page.tsx      making an account
    auth/callback/route.ts  trades a sign-in link's ?code= for a session
    auth/reset/route.ts     the same for a reset link, then on to the form
    (workspace)/          everything behind a sign-in. The brackets keep the
      layout.tsx            group out of the URL, so /vocabulary is still /vocabulary;
                            the layout re-checks the session on the server
      page.tsx              the landing page: the three lists and the challenge card
      vocabulary/page.tsx   Vocabulary page: add, edit, delete, search, sort
      phrases/page.tsx      phrase list, the same shape as Vocabulary
      word/page.tsx         one word by ?id=, read-only plus Edit
      phrase/page.tsx       one phrase by ?id=, read-only plus Edit
      verbs/page.tsx        the conjugation tables, one rolled-up card each
      flashcards/page.tsx   one card at a time from a deck, and what you answered
      settings/page.tsx     one of the three settings groups, by ?section=
      choose-password/page.tsx  where a reset link lands
  components/
    flashcards/
      CreateDeckButton.tsx  opens the dialog, and is the only client part of Home
      CreateDeckDialog.tsx  sources, filters and how many, then build the deck
    MainNav.tsx           the nav bar: Glossary, Verbs, Backup, and the account menu
    NavMenu.tsx           the dropdown the Glossary, Backup and gear tabs open
    AccountMenu.tsx       display name or address, and the gear's Settings menu
    BackupMenu.tsx        Export and Import, loading their dialogs on demand
    backup/
      ExportDialog.tsx    what to export and in which format
      ImportDialog.tsx    what a file holds, what restoring it would do, and doing it
      parts.tsx           the pieces both dialogs share
    AddWordDialog.tsx     add-word flow, including the duplicate prompt
    AddPhraseDialog.tsx   add-phrase flow, including the duplicate prompt
    EditWordDialog.tsx    edit-word flow, including the rename clash
    EditPhraseDialog.tsx  edit-phrase flow
    EntryForm.tsx         shared add/edit form for words
    PhraseForm.tsx        shared add/edit form for phrases
    RefField.tsx          the Ref input, with its name suggestions
    RefText.tsx           renders a parsed Ref value
    DeleteControls.tsx    checkboxes, selection bar, and the delete confirmation
    RowEditButton.tsx     the pencil at the end of a row, beside the bin
    StickyFilters.tsx     the classes that pin a page's filter row under the nav
    EmptyCell.tsx         the dash a blank cell shows instead of nothing
    ImportLocalPrompt.tsx offers an account the notes it made before accounts existed
    StoreErrorBanner.tsx  says so when a read or a save did not reach the database
    NameListEditor.tsx    add / remove / reorder a list of names in Settings
    VerbTableControl.tsx  links to a verb's table, or to making one, from Edit word
    VerbTableCard.tsx     one conjugation table, rolled up until opened
    TenseChoice.tsx       picking a tense, or naming a new one
    Modal.tsx             overlay panel
    Badges.tsx            source / needs-definition pills
  lib/
    flashcards.ts         decks, cards, answers: the flashcard feature's data access
    judgeAnswer.ts        whether what was typed counts as the answer
    remoteStore.ts        the Supabase factory all three list stores are built on
    supabaseClient.ts     the browser client, session kept in cookies
    supabaseServer.ts     the server client, and the verified "who is asking?"
    session.ts            who is signed in, and signing in, up, out and changing a password
    authLinkError.ts      why a sign-in link did not sign you in
    legacyLocal.ts        reads what the app held before it had accounts, once, to import
    constants.ts          what a new account's lists start out as
    types.ts              Entry, Phrase and VerbTable shapes plus validators
    storage.ts            the word store, and how a word is written to a file
    phraseStorage.ts      the phrase store, and the same for a phrase
    verbTables.ts         the conjugation tables, and the same for a table
    backup.ts             one backup file covering all three lists
    backupFile.ts         download plumbing: builds the .xlsx and .json files
    planImport.ts         what merging a backup into a list means, as a pure function
    settings.ts           the account's display name and editable lists
    settingsSections.ts   the three groups Settings is divided into
    exportFolder.ts       the chosen export folder, held in IndexedDB
    useWords.ts           React binding for the word store
    usePhrases.ts         React binding for the phrase store
    useVerbTables.ts      React binding for the conjugation tables
    useSettings.ts        React binding for the settings row
    useSession.ts         React binding for the session store
    useExportFolder.ts    React binding for the export folder
    useListPage.ts        the bookkeeping every list page does around its rows
    useListSelection.ts   row selection shared by both list pages
    useWideScreen.ts      table or cards, decided once rather than per row
    categoryOptions.ts    the categories a list's filter offers
    refSuggestions.ts     the names a Ref field offers to complete
    foldName.ts           the one way a name is folded before it is compared
    sortName.ts           the comparison that skips a leading der / die / das
    parseWord.ts          the paste-to-split rule
    parseRef.ts           turns a Ref value into text and link tokens
    format.ts             date formatting
  types/
    file-system-access.d.ts  the folder picker, which lib.dom does not describe
assets/
  captured-logo.png       the full-size logo artwork, not served
AppScreenshot.JPG         the screenshot shown above
public/
  captured-logo.png       the 256px copy the nav bar loads
  captured-logo-bg.png    the 1000px copy the backdrop loads
supabase/
  config.toml             CLI project config
  migrations/             the tables, indexes, and row level security policies
Docs/
  schema.md               the flashcard and progress schema, and why it is shaped that way
  layouts_and_pages.md    notes on Next.js routing, kept for reference
```

`assets/` holds source art that is not served; `public/` holds what the browser
downloads, so the logo is kept there at the size it is actually shown rather than
at full resolution. The nav loads it through `next/image`, with width and height
given so the bar does not jump while the file arrives.

## Summary

Definition Capture is a compact but capable language-learning workspace: it stores
study material, supports active recall through flashcards, and helps a learner
return to what matters without making the workflow feel heavy.

It is best understood as a focused personal study system rather than a generic
note-taking app, and that focus is what makes it usable over a long stretch of
learning.

Built with Next.js (App Router), TypeScript, Tailwind CSS and Supabase.
