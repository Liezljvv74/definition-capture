# Definition Capture

A small personal list of words and concepts worth remembering. You sign in with
an email and password, and your words and phrases are private to your account.

## Running it

Double-click **`start-app.cmd`**. It installs dependencies the first time, starts the dev
server, and opens the browser for you. Keep the window open while you use the app; closing it stops the server. If the app is already running it just opens the browser again.

Or from a terminal:

```bash
npm install     # first time only
npm run dev
```

Then open <http://localhost:3000>.

Either way you need a `.env.local` first: copy `.env.example` and fill in the two Supabase
values. See [Setting up Supabase](#setting-up-supabase). Without them the app still builds and
runs, but says so instead of showing a sign-in form.

The port is fixed at 3000 on purpose: a sign-in link only returns to a URL Supabase has been
told to accept, and `http://localhost:3000/auth/callback` is the one registered. Starting on
another port would bounce every link. The dev server also accepts requests from any
`192.168.0.x` address, which lets a phone on the same router load it. The subnet is
allowed rather than one address because the router hands them out by DHCP, and pinning a
single number meant phone access broke each time it moved. Change the pattern in
`next.config.ts` if your router uses a different range.

## Where the data lives

All three lists live in **Supabase**, and all three are now views over a single
`learning_items` table: `words`, `phrases` and `verb_tables` are the names the
application reads and writes, and `instead of` triggers turn a write through one of them into
a write to the spine and the matching detail table. A `user_settings` row per account holds
what Settings manages.

The spine is what lets flashcards, review history and progress work across every content type
rather than one page at a time, and it is why adding a content type later is a row in
`item_types` and one detail table rather than a change to every query. The design, and what it
cost, is in [`Docs/schema.md`](Docs/schema.md). All of its migrations are applied.

One private set of rows per signed-in account: sign in on any browser or device and the same
list is there, and a `/word?id=…` link opens anywhere you are signed in.

List queries run in the browser under the publishable key, which is compiled into the
JavaScript bundle and readable by anyone who views source. That is what that key is for,
but it means **row level security is what separates one account's words from another's.**
The policies in `supabase/migrations/` are load-bearing, not decoration; every table has RLS
enabled. `learning_items` carries all four, select, insert, update and delete, each checking
`(select auth.uid()) = user_id`. The detail tables carry no `user_id` of their own and reach
through the shared primary key instead, so there is one answer to who owns a row and the two
cannot drift. `user_settings` has no delete policy, because a settings row is created once and
edited thereafter, never thrown away, and `review_logs` has only select and insert, because a
review that happened cannot later not have happened.

RLS is no longer the *only* thing standing there. `src/proxy.ts` verifies the session on
the server before any page behind a sign-in is rendered, and `src/app/(workspace)/layout.tsx`
verifies it again before those pages run (see [Where the check happens](#where-the-check-happens)).

The three list stores are built from one factory in `src/lib/remoteStore.ts`, so they cannot
drift apart in how they load, save, or report a failure. Two modules read Supabase without it,
and both fail its premise rather than ignore it: `src/lib/settings.ts` holds one row with no id
and no order, and `src/lib/flashcards.ts` asks for a deck that is played once and finished
with. Both borrow the pieces where drifting would be a bug, such as how a failure is worded. It keeps the shape the old `localStorage` store had: the whole list is
fetched once into memory and read synchronously, and a write updates the screen immediately
and goes to the database in the background. That is why adding a word still feels instant,
and why the forms never had to learn that saving became a network call.

The price of writing optimistically is that a failure lands after the edit is already drawn.
When that happens the store reloads the list so the screen shows what is really stored, and
`StoreErrorBanner` says what went wrong, because losing a write silently would be worse than a
banner.

### The list you had before accounts

Earlier versions kept everything in `localStorage` under `definition-capture.entries.v1` and
`definition-capture.phrases.v1`. If a browser still holds those keys, signing in offers to
copy them into the account. The offer is two steps on purpose: the copy runs first, and the
old keys are only removed once you have looked at your list and pressed the second button,
deleting the only copy of that data on the strength of a request whose outcome nobody has
seen yet would be careless. `src/lib/legacyLocal.ts` is the read-only reader for those keys,
and it is the only place left that touches them.

## What a word holds

| Field | Notes |
| --- | --- |
| **Word** | Required, plain text. |
| **Definition** | Optional: leave it blank and fill it in later. |
| **Ref** | Optional free text that links itself; see below. |
| **Category** | Up to three groups the word belongs to, e.g. Nature or Office. Optional. |
| **Source** | Dropdown of your own list, `Manual` / `Google` / `Claude` / `ChatGPT` to begin with. |
| **Date Added** | Set once on creation, never editable. |
| **Date Updated** | Set on every save, shown on the word's own page as "Edited …". Null until the first edit. |
| **Needs Definition** | Derived automatically: true whenever the definition is blank. |

The Source and Category options are yours to edit, under **Settings**. Both lists are
kept per account in `public.user_settings`, so they follow you between devices; the
arrays in **`src/lib/constants.ts`** are only what an account starts with before it has
changed anything.

Taking a name off either list never reaches back into what is already saved. A word
filed under a removed category keeps it: it still shows, still filters, and is still
offered while you edit that word. A word whose source has been removed keeps that
too. What changes is only what is suggested for new ones.

## Pages

- **`/`**: the landing page, a welcome panel in the logo's yellow, a card for each of the
  three lists coloured from the logo's own palette, and the pale blue **Own your progress**
  card that starts a set of flashcards. The logo itself sits as a small mark
  in the bottom right corner of this page rather than as the backdrop it is everywhere else.
- **`/vocabulary`** and **`/phrases`** together make up **Glossary**, one section with two
  views. The grouping lives entirely in the nav (see below), so both keep their own
  addresses, neither list knows about the other, and nothing about how they store or
  read their rows changed.
- **`/vocabulary`**: the **Vocabulary** page, which owns adding, editing, and deleting words.
  Columns are Word, Definition, Category, and Ref. Source lives on the entry's own page
  rather than in the table, where it cost a column and told you little. Search covers
  words, definitions, and refs; a category dropdown narrows the list to one group, and
  clicking a category pill on any row does the same thing without leaving the list; a
  "Needs definition" checkbox narrows to unfinished entries; the Word and Definition
  headers re-sort. A table on laptops, cards on phones. Rows that need a
  definition are flagged in amber. Date Added is not a column, because the list is alphabetical
  by word, and a leading `der`, `die`, or `das` is skipped when comparing, so a word
  filed under its article sorts by the word that follows instead. Date added survives
  as the tie-breaker, and the date itself is shown on the entry's own page.
- **`/phrases`**: the phrase list, a separate store that mirrors Vocabulary, for multi-word
  expressions that do not fit a single word. Columns are **Phrase**, **Literal Meaning**,
  **Usage Example**, **Category**, and **Ref**. No date is a column, since phrases are looked
  up by wording rather than by when they were captured. Search covers the four text fields, a
  category dropdown narrows the list the way it does on Vocabulary, the Phrase and Literal
  Meaning headers each cycle A→Z / Z→A / back to newest-first, and only Phrase is
  required. A phrase also carries a Source and a Date added, both shown on its own page.
  There is no Date Updated: a phrase records when it was captured and nothing about its
  edits, which is the one place the two lists differ in what they keep.
- **`/word?id=…`** and **`/phrase?id=…`**: one item per stable URL, safe to reload or paste
  into a fresh tab. This is where a `[[Name]]` reference lands, and where a name opens from
  either list. Both pages read: they show the
  full untruncated text plus, for a word, its Source badge and dates, and offer **Edit** so a
  cross-link onto a typo can be fixed on the spot. Saving from here returns you to the list.
  Deleting is not offered, since the lists own that. An unknown ID shows a readable "not found"
  message rather than an error page.

- **`/verbs`**: the conjugation tables, one per verb, each rolled up to its verb until
  you open it. Tables are made from a word's Edit screen rather than here, which is what
  keeps a table's name and its word identical: the two are matched by name, the way
  `[[Name]]` links resolve. `?verb=arbeiten` opens that table; `?new=arbeiten` makes it
  first, asking who verbs conjugate for if that has never been answered, and then opens
  it. Both are what the Edit word screen links to.
- **`/flashcards`**: one card at a time from a deck built on the home page. A square card in
  the logo's blue with a navy frame: the front is the word, phrase or verb, and you type what
  it means rather than deciding for yourself whether you knew it.

  A right answer flashes the card pale green and moves on by itself. A wrong one flashes pale
  orange, ticks **needs review** without being asked, and waits, because there are three
  reasonable things to do next: try it again, see the answer, or move on. Each is recorded as
  a different outcome, since "I looked it up" and "I gave up" are not the same thing to have
  done.

  The **needs review** box shows the flag the item already carries, so a deck built from
  flagged items opens with it ticked, and answering moves it in both directions: wrong ticks
  it, right clears it. A card you have learned stops coming back rather than sitting in the
  filter for ever, which is what would happen if only getting one wrong could ever set it.

  Ticking or unticking the box yourself on a card stops the app deciding for that card.
  Marking one you answered correctly is a deliberate "keep this one, I was not sure", and it
  is left alone.

  The marking ignores case, surrounding punctuation and stray spacing, and forgives a typo in
  a long answer, but never an accent: `Tür` and `Tur` are different words and pretending
  otherwise teaches the wrong thing. Two answers that differ only by an accent are refused at
  any length, which they were not at first: the typo tolerance was letting `gemutlich` through
  for `gemütlich` while refusing `schon` for `schön`, so the rule depended on how long the word
  happened to be.

  Whatever is written on the back, typed out exactly, is always right. That sounds too obvious
  to state, and it is here because it was once untrue: every comparison replaced the
  separators with spaces first, so `and/or` was being measured against `and or` and a reader
  copying the answer character for character was told they were wrong, had their streak reset
  and the card flagged.

  Where an answer offers alternatives, separated by a comma or a slash, any one of them will
  do. `gerne` means "gladly, willingly", and somebody who types `gladly` knows the word;
  requiring both, in that order, with the comma, would be testing whether they can reproduce a
  glossary entry instead. Any combination is accepted too, in any order, and it does not
  matter which separator you answer with. Each line of a multi-part answer counts on its own
  for the same reason, so a phrase can be answered with its literal meaning without also
  typing the example.

  An answer that qualifies itself in brackets counts both ways, if you want it to: `to go (on
  foot)` is answered by `to go`, by `to go on foot`, or by typing the brackets out. That is a
  choice in the same list as the separators, because whether an aside says when a word applies
  or what it means depends on how you write your entries. Brackets are never split on, so
  `on foot` is not an answer in its own right either way.

  Which characters count as separators is yours to set, under **Settings → Answer
  separators**: comma, slash, semicolon, pipe and brackets, any combination, or none at all. Ticking a
  character stops it being ordinary text, so with the slash on, an entry reading `and/or`
  offers two answers rather than one; with everything off, answers are marked exactly as they
  are written. The choice is a fixed set rather than a text field because a letter used as a
  separator would split every answer containing that letter, and marking would stop working in
  a way nobody would connect to a settings change made weeks earlier. The database refuses one
  too.

  Otherwise it is deliberately strict: being refused costs a button press, while being wrongly
  told you knew something schedules it weeks away with nothing to notice.
- **`/settings`**, reached from the gear at the right of the nav rather than from the
  tabs, which belong to the two lists. The gear opens a menu of three groups rather than
  going straight to one page, because eight sections on one scroll is a list to hunt
  through. The grouping is by what somebody came to change:

  - **Profile**: **Profile** itself (the address you signed in with, an optional display
    name shown in the nav in its place, and Sign out), **Password** (set one, or change
    it: an account created from an emailed link has none until this is used), and
    **Export folder** (see Backup below).
  - **Glossary settings**: **Glossary Categories** and **Sources** (add, remove, and
    reorder the lists the word and phrase forms offer; source order is the order the
    Source column sorts by, so it is kept rather than alphabetised), plus **Verb persons**
    and **Verb tenses** (what a new conjugation table is built from). Saving the category
    list also brings the flashcard filter's copy of it into line, in the order you put them
    in. A category you remove here is deleted only if nothing is filed under it, which is
    the same promise this page already made about the entries themselves.
  - **Flashcard settings**: **Answer separators**, which punctuation means "or" when a
    flashcard is marked.

  Which group is showing is a `?section=` query parameter, so a group can be linked to and
  survives a reload. Anything unrecognised falls back to Profile: the value comes from a
  URL and can be anything at all, and a settings page rendering nothing looks broken.
  All of it is per account except the export folder, which is per browser.

  Within a group each section is still rolled up to its name and what it is currently set
  to, with a pencil to open the controls. The list sections show their name alone:
  spelling eight categories across a row meant to be skimmed would defeat the point of
  folding it up.

The id is a query parameter rather than a path segment for historical reasons: the app was a
static export, and a `/vocabulary/[id]` route would have had nothing to pre-render, since the
ids only exist in each account's own rows. That constraint is gone now that pages are rendered
on the server, but the shape is kept, because a query parameter is not worth a migration.

These two pages were at `/terms` and `/term?id=…` until the glossary was renamed.
`src/proxy.ts` redirects both, keeping the query string, so a link written down before the
rename still opens the right row. A `[[Name]]` reference needs no such help: it is resolved against the list as it
renders, so it followed the rename on its own.

A thin nav bar at the top of every page carries the Captured logo in the top left corner and
switches between Glossary, Verbs and Backup. There is no Home tab: the logo is the way home,
and two controls for one destination is one too many. Each tab decides for itself which paths
light it up, so a `/word?id=…` or `/phrase?id=…` page keeps Glossary lit.

The bar sticks to the top of the window, and each list page's search and filter row sticks
directly beneath it, so both stay reachable however far down a long list you are. The filter
row is offset by the nav's measured height rather than a written-down one, because the logo
steps up at wider widths and the browser's own font size moves it again.

Glossary is the two lists under one tab, and that tab opens a menu rather than going
anywhere: it stands for two pages, so navigating on click would mean quietly preferring
one of them. Vocabulary and Phrases are the two items, the one you are on is marked, and the
menu closes on Escape, putting focus back on the tab, on a click outside, and on
choosing. The bar deliberately has no horizontal overflow: a scroll on one axis makes
the other one scroll too, which would clip the menu.

At the right-hand end are the signed-in name and a gear that opens the Settings menu.
Signing out is in Settings rather than up here: it is rare and feels destructive, and one click from
a nav bar is closer than it wants to be. On a narrow screen the bar scrolls sideways
rather than wrapping into two rows.

Pages are a light grey and the nav bar above them is white. Each page's header band carries
the colour that page's card has on the home page: blue for Vocabulary and a single word,
green for Phrases and a single phrase, purple for Verbs. The colour is the whole separation,
so those bands have no rule under them, and it is the same in both themes for the reason the
cards are: it is a light colour whatever the browser is set to, so the text on it stays dark.

The logo also appears as a small mark floating in the bottom right corner of every page,
shaded 80%: the artwork is laid over the page at a fifth of its strength, faint enough to
read straight past and still there when you look for it. It is `fixed`, so it stays put while
a long list scrolls behind it and sits in the same place on every page, and it has pointer
events off so it can never intercept a click.

It used to be a large centred backdrop showing through the margins around the cards. That
works on a page with room to spare and not on a full list: the artwork sat behind the table,
the reader caught pieces of it between rows, and it read as something gone wrong rather than
as decoration. Small and cornered is the version that can be on every page without being in
the way of any of them. `--logo-shade` in the `PageBackground` component in
`src/app/layout.tsx` is the only number to change: raise it to fade the mark further, lower
it to bring the artwork forward.

Dates are shown short: `01 Sep 2026`, no clock time. Hovering shows the exact timestamp, and
sorting always uses the full stored value, so two words added on the same day still order
correctly.

## Conjugation tables

A verb's conjugation lives on the Verbs page. There are two ways in. From a word:
**Edit** it and use **Conjugation table**, and if that verb already has one, the same
place shows an icon that opens it instead, so the Edit screen answers "does this word have
a table yet?" either way. Or from the Verbs page itself: **+ Add a verb** asks for the
word along with the tense.

A verb added that way is put on the **Vocabulary** page too, if it is not already there, as a
bare word waiting for its definition. A table and its word are matched by name, so a table
with no word behind it would be a dead end, and inventing one is cheaper than explaining
why the link goes nowhere. A verb that is already saved is left exactly as it is.

Creating one goes straight to the table. The Edit screen only links to
`/verbs?new=<verb>`; the Verbs page does the work and the reader lands on the thing they
asked for, rather than on a confirmation telling them where to go next.

Making one asks which tense it is for: present, past, future, or whatever the language
and the reader call them. The answer is remembered, so the first is typed and every one
after picks from a dropdown, with “Another tense…” for a new one. Tenses are editable
under **Settings → Verb tenses**.

A table holds a column per tense, and the tense is the column heading, in bold. There is
no visible “Conjugation” label, only a hidden one for screen readers, which would
otherwise meet a column with no name. A **+** sits at each end of the tense columns: the
left one inserts a column before the first, the right one after the last, each asking
what tense it is for before it appears.

`tenses[i]` heads the column that every row's `conjugations[i]` fills, so the two are
edited and saved together, since a heading without its column, or the reverse, is not a state
worth being able to reach. Parallel arrays rather than a map keyed by tense name, because
columns are inserted to the left and to the right: order is the point, and a map has
none. Rows are padded or trimmed to the columns that exist when they are read, so a row
cannot fall out of step with the headings above it.

A table made before tenses were asked for keeps its one column with an empty heading.
Nothing invents a tense on its behalf, which is also why the tense list is the one list
here that keeps a blank entry.

The first table also asks who verbs conjugate for: `ich`, `du`, `er/sie/es`, and so on, one per
line. It asks **on the Verbs page**, not in the word dialog: a question about verbs in
general does not belong inside a dialog about one word. That answer is kept in Settings and
used for every table after it, so it is asked once. Nothing sensible could be shipped as a
default: the language being studied is not the app's to assume. The list is editable later
under **Settings → Verb persons**; changing it shapes the next table made, and leaves
tables that already exist with the rows they were made with.

Each table is named for its verb and has a row per person, with a **Conjugation** column and
a notes icon. The icon opens a note for that row (filled in when there is one to read, an
outline when there is not), and notes are saved with the table. Saving folds the table away
again, so the page stays a list of verbs rather than a wall of conjugations.

The rows are one `jsonb` column rather than a second table. They are only ever read, written
and shown as one whole table, and there is no query wanting one person's row across every verb,
so a child table would add a join to answer a question nobody asks, and an `order` column
to keep in step.

## Adding, editing, and deleting

Everything happens on the list pages, in a dialog, without navigating away.

- **Add**: the **Add word** / **Add phrase** button at the top right.
- **Edit**: the pencil at the end of the row, or **Edit** on the item's own page. A name
  in either list is a link to that page rather than to the edit form: it looks like a link,
  so it should behave like one, and reading is what somebody is doing when they scan a list
  and stop at a row. Editing is a decision, and it has a control of its own in both places.
  Every editable field lives in that one form, Source included; Date Added is preserved.
  Renaming onto a name another entry already uses is refused rather than leaving two
  identical entries.
- **Delete one**: the trash button at the end of the row, behind a confirmation.
- **Delete several**: tick the checkboxes (or the select-all box in the header), then use
  **Delete selected** in the bar that appears. The confirmation names what is about to go, up
  to six of them, then "…and N more".

Selection is always intersected with what is on screen, so a row you filter away leaves the
selection on its own, so "Delete selected" can only ever delete rows you can actually see.

## The Ref field

Ref is free text, so a note like `Lecture 4, page 12` is perfectly valid. On top of that, five
patterns are recognised and turned into links, and you can mix them with ordinary words in one
field:

| Write | Links to |
| --- | --- |
| `[[Closure]]` | Whatever is saved under that name: a word **or** a phrase, since the two share one namespace. Words win a name clash. A name that matches nothing is shown plainly rather than as a dead link. **You do not type this form.** Start typing a saved name and the field offers it; picking one writes the brackets for you. The placeholders say "a saved word or phrase" rather than showing the syntax, because a reader who has to be taught a markup to make a link will not make one. |
| `/word?id=abc123`, `/` | A page inside this app. |
| `https://example.com/docs` | Any web page, opened in a new tab. The scheme is hidden in the display so the column stays readable. |
| `www.example.com` | The same, with `https://` assumed. |
| `#definition` | A spot on the page you are already on. |

Wrapping punctuation is handled, so `(https://example.com).` links only the URL. Ref is
searchable along with the other fields on both lists, and it is included in backups.

## Backup: export and import

**Export** and **Import** live under **Backup** in the nav bar, so there is always a copy you
hold yourself and a way out of the app entirely. They used to be a pair of buttons in the
Vocabulary and Phrases headers, which meant Verbs never had them, and the export they offered
was scoped to "this page", a question a nav bar cannot ask. Backing up is about the account,
not the page you happen to be standing on.

By default an export goes wherever the browser puts downloads. **Settings → Export
folder** lets you pick a folder instead, and both formats then write straight into it
under the same file names. The choice is remembered per browser rather than per account:
a folder is granted to one browser on one machine as a handle that cannot be written down
as text, so it lives in IndexedDB and cannot follow you to another device. Only Chromium
browsers can offer it at all. Elsewhere the Settings page says so and exports keep going
to the download folder.

A folder that has been moved, deleted, or had its permission withdrawn stops the export
rather than silently redirecting it: the dialog says what went wrong and offers to pick
another folder, or to use the download folder for this one.

- **Export** asks two things: how much, and in what format.

  **How much**: *Everything*, or one list named outright: *Words*, *Phrases* or *Verb
  tables*, each shown with how many it holds. The file name records the choice:
  `definition-capture-backup-…`, `-words-…`, `-phrases-…`, or `-verbs-…`.

  **What format**: either one covers whatever you chose above, in a single file:

  | Format | What you get |
  | --- | --- |
  | **Excel workbook** (`.xlsx`) | One sheet per exported list: Words, Phrases and Verb tables when you export everything, with bold headers and sensible column widths. A conjugation table is flattened to one row per person per tense, since a sheet is a flat list and a table is a grid. For reading, sorting, or printing outside the app. |
  | **JSON backup** (`.json`) | `{ format, version, exportedAt, words, phrases, verbTables, settings }`, which is plain, readable and **the only format Import can read back in**. Each list is written through its own codec, so the file format is a declared shape rather than whatever the app happens to hold in memory. |

  The button is disabled while there is nothing saved. The workbook is built in the browser by
  [`write-excel-file`](https://www.npmjs.com/package/write-excel-file), the app's one runtime
  dependency beyond Next, React and the Supabase clients. It is imported on demand rather
  than bundled, so it costs nothing until someone asks for a workbook.
- **Import** reads a backup back in. It first shows you what is in the file: how many items
  are new, how many you already have, and how many rows it could not read. Then it asks what to
  do:

  | Mode | Effect |
  | --- | --- |
  | Add only what I don't have | Default. New items are added, existing ones untouched. |
  | Add new and update matching | The backup overwrites what you have. |
  | Replace everything with this backup | What is saved now is deleted first, behind a second confirm. |

Words match on the word, phrases on the phrase, verb tables on the verb, all
case-insensitively, the same rule the add forms use. Imported entries keep their original **Date Added**, which is the point of a backup,
and IDs that would collide are quietly re-issued so nothing is overwritten by accident.

Older backups still work, and that is tested rather than hoped for: a version 1 file (words
only) imports fine, as does a bare array of entries, and so does anything written before the
glossary was renamed, since those files call the list `entries` and the field `term` and the
reader accepts either spelling. Two fields arrived with version 8, and a file without them is
not treated as a file that says no: a phrase with no date recorded is given today's, and a
settings block with no answer separators restores the defaults rather than switching the
marking rules off. **Replace never wipes a list the file carries nothing for**:
restoring a words-only export leaves your phrases and verb tables alone. The confirmation
spells out, per list, what will be deleted and what will be left as it is. Anything unreadable
is counted and reported rather than silently dropped.

## Handy behaviours

- **Paste-to-split.** Pasting `word: definition` or `word - definition` into the Word field
  splits it across both fields. It only fills Definition when that field is still empty, and
  leaves URLs and long sentences alone.
- **Duplicate check.** A word is saved once. Saving one that already exists
  (case-insensitively) offers to update it, or to go back and change the wording. There
  is no “keep both”, because there cannot be: a partial unique index on
  `(user_id, lower(title)) where item_type = 'word'` refuses a second, and `[[Name]]` links,
  the duplicate check itself, and import matching all resolve a name to exactly one entry.
  Phrases work the same way, under an index of their own, which is why a word and a phrase may
  share a name while two words may not.
- **Tabs catch up when you look at them.** Switching to another tab, or back to the window,
  re-reads whichever lists the page you are on is showing, so a word added elsewhere is there
  when you look. Only those: a list nobody is looking at has nothing on screen to be stale.
  It is not live sync: a second tab sitting visible next to the first will not update until
  it is focused. The `localStorage` version got true cross-tab updates free from the
  `storage` event; a database has no equivalent, and Supabase Realtime would mean enabling
  replication for a payoff this app does not really need.

## Setting up Supabase

One project holds every table. From a clean checkout:

```bash
npx supabase login                              # opens a browser; needs a real terminal
npx supabase link --project-ref <your-ref>      # the ref is in the dashboard URL
npx supabase db push                            # applies supabase/migrations/
```

Then, in the dashboard:

- **Project Settings → API**: copy the project URL and the publishable key into `.env.local`.
- **Authentication → URL Configuration → Redirect URLs**: add
  `http://localhost:3000/auth/callback`. That is the route that trades a link's `?code=` for
  a session, and it is what both sign-in links and sign-up confirmations come back to. A link
  returning to an unlisted URL is silently sent to the site root instead, which looks exactly
  like a broken link.

Anyone without an account can make one at **`/sign-up`** with an email and a password. If
the Supabase project requires email confirmation the account waits until the address is
confirmed, and the screen says so; if it does not, the new account is signed in at once.
Either way the screen never states that an account was created, because Supabase answers an
address that already has one exactly as it answers a new one, deliberately, so the form
cannot be used to discover who has an account.

Sign-in is an email and password, checked by Supabase. No password is stored, compared,
or hashed by this app. An emailed one-time link is still offered as a second route, and is
how an account gets created in the first place: Supabase makes the account on the first
link it sends, and **Settings → Password** gives that account a password afterwards.

The link route matters because the built-in email sender is strictly limited, one message
a minute to an address and a few an hour, which is quickly spent by signing in and out
while working on the app. A password has no such limit, which is why it is what the
sign-in screen offers first.

### Where the check happens

Being signed in is decided on the server, before a page exists.

`src/proxy.ts` runs ahead of every request. It refreshes the session cookies (tokens
expire hourly and a Server Component cannot write cookies) and redirects anyone without
a session to `/sign-in`. `src/app/(workspace)/layout.tsx` then asks again on the server
before any page inside the group renders. Two checks, because one of them lives in a file
whose matcher is easy to narrow by accident.

Both use `getClaims()`, never `getSession()`. A session read straight out of a cookie is a
claim made by whoever sent the request; `getClaims` verifies the token's signature against
the project's public keys before believing it. A forged cookie is turned away exactly like
no cookie at all.

The session lives in cookies rather than `localStorage`, which is what makes any of this
possible: `createBrowserClient` from `@supabase/ssr` puts it there, so the server is
handed the same session the browser holds. That also allows **PKCE**: a sign-in link comes
back to `/auth/callback`, a route handler that trades its `?code=` for a session
server-side. The earlier static build had no server for that exchange and had to use the
weaker implicit flow, which returns tokens in a URL fragment.

A link that has expired or already been used comes back with an error in the URL rather
than a session. `src/lib/authLinkError.ts` reads it before anything else can clear it and
the sign-in screen says so, because the alternative, an unexplained form, invites
asking for another link, and there are not many to spare. What it says is its own
sentence, chosen by error code from a closed list: repeating back whatever the URL
carried would have let any link make this app say anything in its own voice.

A second device does not have to wait for an email either: sign in with the same email
and password anywhere. **Settings → Password** is where a password is set or changed, and
it is the only thing an account created by link needs in order to stop depending on the
email sender.

The built-in email sender is rate limited twice over: a few messages an hour in total,
and no more than one a minute to the same address. `email rate limit exceeded` means one
of those, not a broken configuration. A real SMTP provider under **Authentication →
Emails** lifts both, and is what to do before anyone else uses this.

> Do not run `supabase config push` against this project to change those limits. The
> local `config.toml` is largely defaults and differs from the hosted project in about a
> dozen places (`supabase config diff` lists them), so a push would also switch off
> email confirmations and MFA. Change auth settings in the dashboard.

`npx supabase migration new <name>` starts a new migration and `npx supabase db push` applies
it. `npx supabase db query -f query.sql --linked` runs a one-off query against the hosted
database, which is the quickest way to check what is really in there. All three go over the
network and need nothing installed locally.

`db pull`, `db dump`, and `db diff` are the exceptions: each builds a throwaway shadow
database in a container to diff against, so on a machine with neither Docker Desktop nor
Podman they stop with `docker: command not found`. Nothing in the normal workflow here needs
them: write the migration by hand and push it.

`npx supabase login` opens a browser and then waits for a keypress, so it only works in a real
terminal; inside an editor or agent shell it exits with `Cannot use automatic login flow
inside non-TTY environments`. Log in once in a terminal and every other tool picks up the
stored credentials.

## Deploying

**Not deployed at the moment, and that is deliberate.**

The app used to be a static export (`output: "export"`) published to GitHub Pages at
<https://liezljvv74.github.io/definition-capture/>. That had to go. A static host serves
files with no process behind them, so there was nowhere to ask whether a visitor was signed
in except the browser, and a check the browser makes is a check the browser can be told to
skip. Verifying the session on the server means having a server.

So `output: "export"`, the `/definition-capture` basePath and the `GITHUB_PAGES` flag are all
gone from `next.config.ts`, the Pages workflow is gone from `.github/`, and the committed
`out/` directory, which held the last static build, has been deleted. Nothing in the tree is
designed around the absence of a server any more.

The next host needs to run Node, so that `src/proxy.ts` and the server components actually
execute. Whatever it is will need `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in its build environment (both are compiled into
the browser bundle and meant to be public), and its origin added to **Authentication → URL
Configuration → Redirect URLs** in the Supabase dashboard, as `<origin>/auth/callback`.

A deployed copy is the same list: sign in there and your words are the ones you saved
locally, because both talk to the same Supabase project.

## Checking the code

```bash
npx tsc --noEmit     # types
npx eslint src/      # lint
npx vitest run       # 25 suites, node environment, no jsdom and no browser
npm run build        # when routing or rendering changed
```

The build is worth running for its route table rather than for the bundle: it prints which
routes are static and which are server-rendered, which is how a protected page is confirmed to
still be dynamic. Every route but `/sign-in` and `/sign-up` should be marked `ƒ`.

The tests run in node and render components to a string where they need markup at all, so
there is no jsdom to configure and no browser to drive. What they cover is chosen rather than
uniform: the paths that can lose data quietly, such as importing a backup, writing through the
store, and deciding whether a typed answer is right. Several of them were checked by breaking
the code on purpose and confirming they noticed.

## Layout of the code

```
src/
  proxy.ts                verifies the session before any page is rendered
  app/
    layout.tsx            shell, metadata, and the shaded logo backdrop
    globals.css           Tailwind theme and shared control styles
    sign-in/page.tsx      a password, or an emailed link
    sign-up/page.tsx      making an account
    auth/callback/route.ts  trades a sign-in link's ?code= for a session
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
    ImportLocalPrompt.tsx offers a pre-account localStorage list to the account
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
    session.ts            who is signed in, plus sign-in, sign-up, and sign-out
    authLinkError.ts      why a sign-in link did not sign you in
    legacyLocal.ts        read-only access to the pre-account localStorage keys
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
  app-screenshot.jpg      the screenshot the README ends with
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

`assets/` holds source art that is not served; `public/` holds what the browser downloads, so
the logo is kept there at the size it is actually shown rather than at full resolution. The nav
loads it through `next/image`, with width and height given so the bar does not jump while the
file arrives.

Built with Next.js (App Router), TypeScript, Tailwind CSS, and Supabase.

## What it looks like

![An empty glossary: the Captured logo in the nav bar, Glossary and Phrases tabs, Export, Import and Add buttons at the top right, and the shaded logo backdrop showing around the empty-list card](assets/app-screenshot.jpg)

An empty list on first run: the state the app opens in before anything is saved.

The picture is older than the app around it, and it is kept for what it shows rather than
for being current: Glossary and Phrases were still two top-level tabs, Export and Import were
still buttons on the page, and the list was still called Terms. There is no Verbs tab, no
Backup menu and no account menu in it.
