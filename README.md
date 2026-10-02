# Definition Capture

Definition Capture is a personal language-learning workspace for saving words,
phrases, verb conjugations and grammar rules, then returning to them with
flashcards that come back when they are due.

It was designed to bring scattered study notes into one place so learning feels
clearer, more organised and easier to revisit over time. It is built for language
learners who want a lightweight system for collecting vocabulary, reviewing
phrases and keeping conjugation patterns and grammar in view without losing track
of what they already know.

It is live at <https://definition-capture.vercel.app>.

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

- save words, phrases, conjugation tables and grammar rules
- organise words and phrases by collection and source, and rules by topic
- link any item to any other, and revisit each one from a stable link
- see on one dashboard what is due for review and how far along they are
- build flashcard decks from chosen lists and filters
- keep all of it private to their own account

Everything is stored in Supabase and scoped to the account that saved it. Sign in
on another browser or device and the same lists are there.

## Core features

- **Dashboard**: what is due for review, progress so far, a word to test yourself
  on, and what was captured most recently.
- **Vocabulary**: words, definitions, references, collections and sources, with
  search, a collection filter, sorting, and a flag for words whose definition is
  still to be written.
- **Phrases**: expressions with a literal meaning and a usage example, kept as
  their own list so a phrase does not have to pretend to be a word.
- **Verb tables**: a conjugation table per verb, with a column per tense, a row
  per person, a note against any row, and notes on the table.
- **Grammar rules**: a rule per page, written as text, table and example blocks,
  filed under one topic, with highlights and links in the reading view.
- **Flashcards**: a deck built from chosen lists and filters, or of only what is
  due, one card at a time, with the typed answer marked and the schedule updated
  from what happened.
- **Backup**: export everything, or one list, as JSON or as an Excel workbook,
  and import a backup again without disturbing the lists the file says nothing
  about.
- **Accounts**: Supabase Auth for sign-in, sign-up and password reset, behind a
  Cloudflare Turnstile check, with every protected page checked on the server
  before it renders.

## Tech stack

| | |
| --- | --- |
| Framework | Next.js 16.3.4, App Router, Turbopack |
| UI | React 19.2.8, TypeScript 5, Tailwind CSS 4 |
| Data and auth | Supabase: Postgres with row level security, and Supabase Auth |
| Captcha | Cloudflare Turnstile, verified by Supabase Auth |
| Supabase clients | `@supabase/ssr` (browser and server), `@supabase/supabase-js` |
| Exports | `write-excel-file`, imported on demand |
| Tests | Vitest 3, in the node environment; Playwright for end-to-end tests |
| Hosting | Vercel, deployed from GitHub on every push to `main` |

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

Either way you need a `.env.local` first. Copy `.env.example` and fill it in. The
two Supabase values are under Project Settings → API in the dashboard; the
Turnstile site key is in the Cloudflare dashboard:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
```

All three are compiled into the browser bundle and are meant to be public; row
level security is what protects the data behind them. Without the Supabase pair
the app still builds and runs, but says so instead of showing a sign-in form.
Local development uses the live Supabase project, which has captcha switched on,
so the site key is needed locally too (localhost is a listed hostname on the
widget); with it empty every sign-in is refused. It is left empty only against a
local Supabase copy, where captcha is off.

The port is fixed at 3000 on purpose: a sign-in link only returns to a URL
Supabase has been told to accept, and `http://localhost:3000/auth/callback` is
the one registered for local development. The dev server also accepts requests
from any `192.168.0.x` address, which lets a phone on the same router load it.
Change the pattern in `next.config.ts` if your router uses a different range.

## Setting up Supabase

One project holds every table, and local development and production share it.
From a clean checkout:

```bash
npx supabase login                              # opens a browser; needs a real terminal
npx supabase link --project-ref <your-ref>      # the ref is in the dashboard URL
npx supabase db push                            # applies supabase/migrations/
```

Then, in the dashboard:

- **Project Settings → API**: copy the project URL and the publishable key into
  `.env.local`.
- **Authentication → URL Configuration**: set the Site URL to the production
  origin, and add `/auth/callback` and `/auth/reset` under Redirect URLs for both
  `http://localhost:3000` and `https://definition-capture.vercel.app`. The first
  trades a link's `?code=` for a session and is where sign-in links and sign-up
  confirmations come back to; the second does the same for a password reset and
  then sends the reader to the form for choosing one. A link returning to an
  unlisted URL is silently sent to the site root instead, which looks exactly
  like a broken link, so a missing reset entry shows up as "the reset link did
  nothing". Password sign-in does not depend on any of this.
- **Authentication → Attack Protection**: captcha, with Turnstile as the provider
  and the Turnstile **secret** key. The secret lives here and nowhere else: not
  in code, not in `.env.local`, not in Vercel. The Turnstile widget must list
  `definition-capture.vercel.app` and `localhost` as hostnames. Deploy code that
  sends a token before switching captcha on, or every sign-in is refused.

### Accounts, sign-in and passwords

Anyone without an account can make one at **`/sign-up`** with an email and a
password. If the project requires email confirmation the account waits until the
address is confirmed, and the screen says so. Either way the screen never states
that an account was created, because Supabase answers an address that already has
one exactly as it answers a new one, deliberately, so the form cannot be used to
discover who has an account.

Sign-in is an email and password, checked by Supabase. No password is stored,
compared or hashed by this app. An emailed one-time link is offered as a second
route, and it creates the account if there is none: Supabase makes the account on
the first link it sends. Signing in, or arriving at `/`, `/sign-in` or `/sign-up`
already signed in, lands on **`/home`**.

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

Every form that calls Supabase Auth (sign-up, password sign-in, the emailed link,
the reset request and the current-password check in Settings) shows a Cloudflare
Turnstile check and keeps its button disabled until it is solved. Tokens are
single use, so a fresh check appears after each attempt, and a refused token is
reported as "Please complete the check and try again." With no site key the
widget renders nothing and no token is sent.

The built-in email sender is rate limited twice over: a few messages an hour in
total, and no more than one a minute to the same address. `email rate limit
exceeded` means one of those, not a broken configuration. A real SMTP provider
under **Authentication → Emails** lifts both. A password has no such limit, which
is why the sign-in screen offers it first.

> Do not run `supabase config push` against this project. The local `config.toml`
> is largely defaults and differs from the hosted project in about a dozen places
> (`supabase config diff` lists them), so a push would also switch off email
> confirmations and MFA. Change auth settings in the dashboard.

`npx supabase migration new <name>` starts a new migration and `npx supabase db
push` applies it. `npx supabase db query -f query.sql --linked` runs a one-off
query against the hosted database, which is the quickest way to see what is really
in there. All three go over the network and need nothing installed locally.
`db pull`, `db dump`, `db diff` and the local copy (`npx supabase start`) are the
exceptions: each runs in a container, so without Docker or Podman they stop with
`docker: command not found`. Day-to-day work does not need them: write the
migration by hand and push it. Only the signed-in end-to-end tests need the local
copy.

`npx supabase login` opens a browser and waits for a keypress, so it only works in
a real terminal; inside an editor or agent shell it exits with `Cannot use
automatic login flow inside non-TTY environments`. Log in once in a terminal and
every other tool picks up the stored credentials.

## Authentication and session model

Being signed in is decided on the server, before a page exists.

`src/proxy.ts` runs ahead of every request. It refreshes the session cookies
(tokens expire hourly and a Server Component cannot write cookies), redirects
anyone without a session to `/sign-in`, and sends anyone with one from `/`,
`/sign-in` or `/sign-up` to `/home`. Only `/`, `/sign-in`, `/sign-up` and
`/auth/*` are reachable signed out, plus the files the matcher skips: Next's
static output, the logo images, `robots.txt`, `sitemap.xml`, `llms.txt` and the
Open Graph image. `src/app/(workspace)/layout.tsx` then asks again, on the
server, before any page inside the group renders. Two checks, because one of them
lives in a file whose matcher is easy to narrow by accident.

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

The only keys anywhere are public ones. `NEXT_PUBLIC_*` holds the project URL,
the publishable key and the Turnstile site key. The project holds no service-role
key at all, and the Turnstile secret lives only in the Supabase dashboard.

## Where the data lives

Every list is in Supabase, in nine tables with no views and eight functions,
none of them `security definer`. The design, and why it is shaped that way, is in
[`Docs/schema.md`](Docs/schema.md); how it got there is in
[`Docs/db-refactor-plan.md`](Docs/db-refactor-plan.md).

| Table | Holds |
| --- | --- |
| `items` | every word, phrase, verb table and grammar rule, one row each, with a check per type on its detail columns |
| `tags` | collections, and grammar topics, told apart by `context` |
| `item_tags` | which item carries which tag, in order (up to five collections, exactly one topic per rule) |
| `sources` | where a definition came from; an item has at most one |
| `decks`, `deck_cards` | a deck built once and played |
| `progress` | each item's place in the review schedule |
| `reviews` | every answer ever given, append-only |
| `user_settings` | one row of preferences per account |

The functions are `save_items`, `record_review`, `build_deck`, `home_summary`,
`rename_tag`, `rename_item_source`, and the two triggers on `items`,
`items_guard` and `set_updated_at`. Every write of a list goes through
`save_items`, one transaction per call.

List queries run in the browser under the publishable key, which anyone can read
out of the bundle. That is what that key is for, but it means **row level security
is what separates one account's words from another's.** Every table has RLS
enabled in the migration that creates it, with one policy per command, `to
authenticated`, checking `(select auth.uid()) = user_id`, and `with check` on
insert and update. A command with no policy is also revoked: `reviews` has no
update or delete, because a review that happened cannot later not have happened.
Every owned row carries `user_id`, and composite foreign keys `(x_id, user_id)`
make a link between two accounts' rows impossible. `anon` holds no privilege on
anything.

The four list stores (words, phrases, verb tables, rules) are built from one
factory in `src/lib/remoteStore.ts`, so they cannot drift apart in how they load,
save or report a failure. Two modules read Supabase without it and both fail its
premise rather than ignore it: `src/lib/settings.ts` holds one row with no id and
no order, and `src/lib/flashcards.ts` asks for a deck that is played once and
finished with. The dashboard reads on the server, in `src/lib/homeData.ts`, under
the caller's session.

Writes are optimistic: the screen updates first and the database follows. When a
write fails the store reloads the list so the screen shows what is really stored,
and `StoreErrorBanner` says what went wrong, because losing a write quietly would
be worse than a banner.

### Design principles behind the schema

- one row per item, in one table, with checks keeping each detail field on its type
- every fact has one home: collections and sources are rows that items point at
- the app writes base tables, so there are no views and no `instead of` triggers
- every owned row carries `user_id`, and the database proves it agrees with its parent
- review history append-only, so a summary can always be rebuilt from it
- timestamps belong to the database

## The app, page by page

### The landing page

`/` is public and is the page search engines are meant to read. It says what the app
is, what it keeps, how the flashcards work and that the lists are private, then
answers a few questions and offers **Create an account** and **Sign in**. It reads
no session and is prerendered. It carries `WebApplication` and `FAQPage`
structured data built from the same questions it shows. `robots.ts` lets crawlers
read the public pages and keeps them out of the workspace, `sitemap.ts` lists the
three public pages, `opengraph-image.tsx` draws the preview image, and
`public/llms.txt` describes the app in plain text. Every workspace page is marked
`noindex`.

### Navigation

The logo goes to the dashboard. Beside it are **Glossary** (a menu holding
Vocabulary and Phrases), **Verbs**, **Grammar** and **Backup**, and at the right
the display name and the gear that opens Settings. Below the `sm` breakpoint the
four destinations move into a menu button; Backup and Settings stay in the bar.
The menu closes on a link, on Escape, on a tap outside it, or on back and forward.

### Home

`/home` is the dashboard, rendered on the server from one `home_summary()` call
and one query for recent items. From the top:

- **Welcome back**, with the display name or else the email, and when the account
  last saved anything.
- **Your progress**: a bar of New, Learning and Learned, counting only items that
  can make a card. Learned means a streak of two or more correct answers. Hidden
  when there is nothing to count.
- **Ready for review**, which follows the account's state: items due gives
  **Review now** (a deck of up to fifty due cards, most overdue first); nothing
  due but new items gives **Learn new items**; all caught up says when the next
  review is; items with no answer to show link to Vocabulary to add a definition;
  an empty account links to Vocabulary to capture a first word. The last three
  show a quote. **Customise deck** opens the deck builder, which asks which lists
  to draw from (all items, words, phrases or verbs, or the most recently added),
  whether to take only items marked as needing review, which collections to
  narrow to, and how many cards. The default is everything, fifty cards.
- **Do you still remember this one?**: one difficult word or phrase (missed
  before, right under 80% of the time, or not yet learned, and longer than four
  letters). Pressing the word reveals its meaning in place.
- **Recently captured**: the four newest items of any kind, each linked.
- A card for each of the four lists with its count, and for Vocabulary how many
  still need a definition.

### Vocabulary and Phrases

Together these are **Glossary**, one section with two pages. Vocabulary owns
adding, editing and deleting words; its columns are Word, Definition, Collection
and Ref. Search covers words, definitions and refs, a collection dropdown narrows
to one group (clicking a collection badge does the same), a "Needs definition"
checkbox narrows to unfinished entries, and the Word and Definition headers
re-sort. The list is alphabetical in the order of the language chosen in Settings,
and a leading word from that language's skip list, usually an article such as
`der` or `la`, is skipped when comparing, so a noun files under its own word. Rows
that still need a definition are flagged in amber. A table on laptops, cards on
phones. A word or phrase can be in up to five collections.

Phrases mirrors that shape for multi-word expressions, with Phrase, Literal
Meaning, Usage Example, Collection and Ref, and only Phrase required.

Clicking a name opens that item's own page rather than the edit form. Editing has
the pencil at the end of the row and the **Edit** button on the page itself.

### One word or one phrase

`/word?id=…` and `/phrase?id=…` give every item a stable link, safe to reload or
paste into a note. This is where a `[[Name]]` reference lands, and where a name
opens from either list. Both pages show the full untruncated text, the Source, the
date it was captured and last edited, a Ref whose references can be followed, and
**Linked from**, the items whose text links here. Deleting is not offered; the
lists own that. An unknown id shows a readable "not found" message rather than an
error page. The old addresses `/terms` and `/term?id=…` redirect to `/vocabulary`
and `/word?id=…`.

### Verbs

One conjugation table per verb, each rolled up to its verb until opened, with a
search box. A table is made with **Add verb** on this page, or from a word's Edit
screen. A verb added here is also added to Vocabulary if it is not there already,
because a table and its word are matched by name, the way `[[Name]]` links
resolve. Making a table asks for the tense, and the persons the first time. A
table holds a column per tense and a row per person, with a note against any row,
and Notes on the table itself that render links like a Ref. `/verbs?verb=<name>`
opens the page at that table, which is where a link to a verb table lands.

### Grammar

`/grammar` lists every rule with its topic, with search, a topic filter, **Add
rule** (a title and a topic) and a bin per row. Deleting a rule that other items
link to says so first, and those links are left dotted until a rule of that name
exists again.

`/rule?id=…` is one rule. It opens in a reading view; **Edit** turns the same page
into the editor. A rule is a stack of blocks, reordered by a drag handle or by
Move up and Move down:

- **Text**, with `**bold**`, `*italic*`, `- ` bullets and `[[links]]`.
- **Table**, a free grid with optional header row and column. In Edit mode cells
  are selected by dragging, Shift-click or the row and column bars, and copied,
  cut and pasted as tab-separated text, so a block moves to and from a
  spreadsheet.
- **Example**, a sentence with its translation, gap words marked in `{braces}`.

Selecting text in the reading view offers **Highlight** in yellow, green, blue or
purple (and Remove highlight), **Link to…**, which searches every item and turns
the selection into a link, and **New rule from this**, which creates an empty rule
from the selected words and links to it. Rules make no flashcards.

### Flashcards

One card at a time from a deck built on the dashboard. The front is the word,
phrase or verb, and you type what it means rather than deciding for yourself
whether you knew it.

A right answer flashes pale green and moves on by itself. A wrong one flashes pale
orange, ticks **needs review**, and waits, because there are three reasonable
things to do next: **Try again**, **See the answer**, or **Continue**. Each is
recorded as a different outcome, since "I looked it up" and "I gave up" are not
the same thing to have done. Answering correctly clears the flag again, so a card
that has been learned stops coming back; ticking or unticking the box yourself on
a card stops the app deciding for that one.

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

Reached from the gear at the right of the nav, which opens a menu of four groups
rather than going straight to one page:

- **Profile**: the address you signed in with, an optional display name shown in
  the nav in its place, Sign out, **Password** (see above), and **Export folder**.
- **Glossary settings**: the **Language** you are learning, which sets the
  alphabetical order of every list, and the **Words to skip when sorting** that
  Vocabulary looks past. Eleven common languages are ready-made: seven fill the
  list with their articles, and Chinese, Japanese, Korean and Russian, which have
  none, set only the order. Eight also fill Verb persons in textbook order; the
  three whose verbs do not change with the person leave that list alone. Any
  other language, or one typed in by name, starts with an empty list to fill in.
  Then Glossary Collections and Sources, plus Verb persons and Verb tenses.
  Collections, Sources and Verb tenses are kept in alphabetical order. Verb
  persons keep the order they were added in, since that is the row order of a new
  conjugation table. Every list has a pencil to rename a name. A collection is
  renamed on every word and phrase filed under it, merging into another
  collection if the new name is already taken, and a source on every word and
  phrase that came from it. A person or tense is renamed for tables made from
  then on, and existing tables keep what they were made with. A collection or
  source still in use cannot be removed: its bin is switched off and says how
  many items use it.
- **Grammar settings**: the **Topics** rules are filed under, with the same
  rename, merge and in-use rules as collections.
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
that, these patterns are recognised and turned into links, and they can be mixed
with ordinary words in one field. The same `[[Name]]` links work in a verb
table's notes and in a grammar rule's text.

| Write | Links to |
| --- | --- |
| `[[Closure]]` | Whatever is saved under that name: a rule, verb table, word or phrase, since all four share one namespace. A shared name resolves in that order. **You do not type this form.** Start typing a saved name and the field offers it; picking one writes the brackets for you. |
| `[[Dativ\|dem]]` | The same, shown as the words after the bar. |
| `/word?id=abc123`, `/` | A page inside this app. |
| `https://example.com/docs` | Any web page, opened in a new tab. The scheme is hidden in the display so the column stays readable. |
| `www.example.com` | The same, with `https://` assumed. |
| `#definition` | A spot on the page you are already on. |

Wrapping punctuation is handled, so `(https://example.com).` links only the URL.
Renaming a rule, word or phrase rewrites every `[[Old name]]` that points at it.
Ref is searchable along with the other fields, and it is included in backups.

## Adding, editing and deleting

For words and phrases everything happens on the list pages, in a dialog, without
navigating away.

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

  **How much**: *Everything*, or one list named outright (Words, Phrases, Verb
  tables, Grammar rules), each shown with how many it holds. The file name
  records the choice.

  **What format**:

  | Format | What you get |
  | --- | --- |
  | **Excel workbook** (`.xlsx`) | One sheet per exported list, with bold headers and sensible column widths. A conjugation table is flattened to one row per person per tense, and a rule to its title, topic and flattened text. For reading, sorting or printing outside the app. |
  | **JSON backup** (`.json`) | `{ format, version, exportedAt, words, phrases, verbTables, rules, settings }`, which is plain, readable and **the only format Import can read back in**. Each list is written through its own codec, so the file format is a declared shape rather than whatever the app happens to hold in memory. |

- **Import** reads a backup back in. It first shows what is in the file: how many
  items are new, how many you already have, and how many rows it could not read.
  Then it asks what to do:

  | Mode | Effect |
  | --- | --- |
  | Add only what I don't have | Default. New items are added, existing ones untouched. |
  | Add new and update matching | The backup overwrites what you have. |
  | Replace everything with this backup | Anything saved now that is not in the backup is deleted, behind a second confirm. |

Words match on the word, phrases on the phrase, verb tables on the verb and rules
on the title, all case-insensitively, the same rule the add forms use. Imported
entries keep their original **Date Added**, which is the point of a backup, and
ids that would collide are quietly re-issued so nothing is overwritten by
accident. Replace saves the file over the list first and then deletes only the
rows the file lacks, and each file item takes the id of the row it replaces, so a
restored item keeps its review history and schedule.

Older backups still work, and that is tested rather than hoped for: a version 1
file imports fine, as does a bare array of entries, and so does anything written
before the glossary was renamed, since those files call the list `entries` and the
field `term` and the reader accepts either spelling. Files before version 10 call
collections `categories`, and that is read too. Two fields arrived with version 8,
and a file without them is not treated as a file that says no: a phrase with no
date recorded is given today's, and a settings block with no answer separators
restores the defaults rather than switching the marking rules off. Version 9 adds
the language and its skip list, and a file without them leaves yours as they are.
Version 11 adds grammar rules, and version 12 a verb table's notes; an Update
from a file without notes leaves a table's notes alone.
**Replace never wipes a list the file carries nothing for**: restoring a
words-only export leaves your phrases, verb tables and rules alone. Anything
unreadable is counted and reported rather than silently dropped.

## Handy behaviours

- **Enter moves down.** In any field, Enter moves to the field below it: in a
  table the cell underneath, in a form the next line down. Tab keeps the
  browser's order, across and then down. A multi-line text box keeps Enter for a
  new line.
- **Paste-to-split.** Pasting `word: definition` or `word - definition` into the
  Word field splits it across both fields. It only fills Definition when that field
  is still empty, and leaves URLs and long sentences alone.
- **Duplicate check.** A word is saved once. Saving one that already exists
  (case-insensitively) offers to open it for editing, or to go back and change
  the wording. There is no "keep both", because there cannot be: a unique index
  on `(user_id, item_type, lower(title))` refuses a second, and `[[Name]]` links,
  the duplicate check itself and import matching all resolve a name to exactly
  one entry. Phrases, verb tables and rules work the same way, which is why a word
  and a phrase may share a name while two words may not.
- **Tabs catch up when you look at them.** Switching to another tab, or back to the
  window, re-reads whichever lists the page you are on is showing, so a word added
  elsewhere is there when you look. It is not live sync: a second tab sitting
  visible next to the first will not update until it is focused.

## Checking the code

```bash
npx tsc --noEmit     # types
npx eslint src/      # lint
npx vitest run       # 52 test files, node environment, no jsdom and no browser
npm run build        # when routing or rendering changed
npm run e2e          # Playwright end-to-end tests
```

The build is worth running for its route table rather than for the bundle: it
prints which routes are static and which are server-rendered, which is how a
protected page is confirmed to still be dynamic. `/`, `/sign-in`, `/sign-up` and
the crawler files are static; every workspace route should be marked `ƒ`.

The unit tests run in node and render components to a string where they need
markup at all, so there is no jsdom to configure and no browser to drive. What
they cover is chosen rather than uniform: the paths that can lose data quietly,
such as importing a backup, writing through the store, and deciding whether a
typed answer is right. Several were checked by breaking the code on purpose and
confirming they noticed. `supabase/tests/home_summary.sql` rehearses
`home_summary` and the due-only deck against the local Supabase copy, inside a
transaction that is rolled back.

The end-to-end tests in `e2e/` sign in through the real form as a dedicated test
account (`E2E_EMAIL` and `E2E_PASSWORD` in `.env.local`) and add and delete rows.
Without `E2E_BASE_URL` they target production, where only the public landing test
runs: production sign-in is behind the captcha, which a script cannot solve, so
the fixture skips every signed-in test unless the base URL is localhost. Those run
against the local Supabase copy (`npx supabase start`), with a temporary
`.env.development.local` pointing the app at it and the Turnstile site key empty,
`npm run dev` restarted, and `E2E_BASE_URL=http://localhost:3000`. CLAUDE.md has
the full procedure. Plans for each spec live in `e2e/specs/`.

## Deploying

The app is on **Vercel** as the `definition-capture` project, at
<https://definition-capture.vercel.app>. Vercel's GitHub integration builds and
deploys every push to `main` on its own, so pushing to `main` is releasing.

- **Migrations are not part of a deploy.** Vercel builds the Next.js app and
  nothing else. Run `npx supabase db push` before the code that needs a migration
  reaches `main`, or production breaks with it.
- **The build reads its environment from Vercel**, not from `.env.local`:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, all public. No secret goes there.
- **Emailed links need the production origin registered**, as described under
  Setting up Supabase.
- **Per-deployment URLs are private.** Each deploy also gets its own address,
  behind Vercel's login. Only the production domain is public.

Any host for this app has to run Node, so that `src/proxy.ts` and the server
components actually execute. A deployed copy is the same list: sign in there and
your words are the ones you saved, because local development and production use
the same Supabase project.

## Layout of the code

```
src/
  proxy.ts                verifies the session before any page is rendered
  app/
    layout.tsx            shell, metadata, Enter-moves-down, and the shaded logo backdrop
    globals.css           Tailwind theme and shared control styles
    page.tsx              the public landing page, with its structured data
    robots.ts             robots.txt: public pages in, workspace out
    sitemap.ts            sitemap.xml: the three public pages
    opengraph-image.tsx   the link preview image, drawn with next/og
    sign-in/page.tsx      a password, an emailed link, or a reset link
    sign-up/page.tsx      making an account
    auth/callback/route.ts  trades a sign-in link's ?code= for a session
    auth/reset/route.ts     the same for a reset link, then on to the form
    (workspace)/          everything behind a sign-in. The brackets keep the
      layout.tsx            group out of the URL, so /vocabulary is still /vocabulary;
                            the layout re-checks the session on the server and sets noindex
      home/page.tsx         the dashboard, rendered on the server
      home/error.tsx        what the dashboard shows when its data could not be read
      vocabulary/page.tsx   Vocabulary page: add, edit, delete, search, sort
      phrases/page.tsx      phrase list, the same shape as Vocabulary
      word/page.tsx         one word by ?id=, read-only plus Edit
      phrase/page.tsx       one phrase by ?id=, read-only plus Edit
      verbs/page.tsx        the conjugation tables, one rolled-up card each
      grammar/page.tsx      the rule list
      rule/page.tsx         one rule by ?id=, the reading view and the editor
      flashcards/page.tsx   one card at a time from a deck, and what you answered
      settings/page.tsx     one of the four settings groups, by ?section=
      choose-password/page.tsx  where a reset link lands
  components/
    home/
      ReviewCard.tsx      Ready for review: its five states and their buttons
      RememberCard.tsx    the word that reveals its meaning when pressed
    flashcards/
      CreateDeckButton.tsx  Customise deck, which opens the dialog
      CreateDeckDialog.tsx  lists, filters and how many, then build the deck
    grammar/
      AddRuleDialog.tsx   a new rule's title and topic
      RuleEditor.tsx      Edit mode: the block stack and saving it
      BlockEditor.tsx     one block's controls: drag handle, Move up, Move down
      TableEditor.tsx     the table grid, with cell selection, copy, cut and paste
      MarkedField.tsx     a text field that shows highlight markers faintly
      BlockView.tsx       a block as read
      RichText.tsx        renders a rule's text markup
      ReadingTools.tsx    the reading view's selection tools
      SelectionToolbar.tsx  Highlight, Link to… and New rule from this
      LinkToDialog.tsx    searching every item to link a selection to
      TopicSelect.tsx     picking a rule's topic from the Settings list
      readSelection.ts    maps the browser's selection onto the stored text
    MainNav.tsx           the nav bar, and the phone menu
    NavMenu.tsx           the dropdown the Glossary, Backup and gear tabs open
    AccountMenu.tsx       display name or address, and the gear's Settings menu
    BackupMenu.tsx        Export and Import, loading their dialogs on demand
    backup/
      ExportDialog.tsx    what to export and in which format
      ImportDialog.tsx    what a file holds, what restoring it would do, and doing it
      parts.tsx           the pieces both dialogs share
    Turnstile.tsx         the Cloudflare Turnstile check on every auth form
    EnterMovesDown.tsx    Enter moves to the field below, app-wide
    AddWordDialog.tsx     add-word flow, including the duplicate prompt
    AddPhraseDialog.tsx   add-phrase flow, including the duplicate prompt
    EditWordDialog.tsx    edit-word flow, including the rename clash
    EditPhraseDialog.tsx  edit-phrase flow
    EntryForm.tsx         shared add/edit form for words
    PhraseForm.tsx        shared add/edit form for phrases
    RefField.tsx          the Ref input, with its name suggestions
    RefText.tsx           renders a parsed Ref value
    LinkedFrom.tsx        the items that link to this one
    DeleteControls.tsx    checkboxes, selection bar, and the delete confirmation
    RowEditButton.tsx     the pencil at the end of a row, beside the bin
    StickyFilters.tsx     the classes that pin a page's filter row under the nav
    EmptyCell.tsx         the dash a blank cell shows instead of nothing
    StoreErrorBanner.tsx  says so when a read or a save did not reach the database
    NameListEditor.tsx    add / rename / remove a list of names in Settings
    VerbTableControl.tsx  links to a verb's table, or to making one, from Edit word
    VerbTableCard.tsx     one conjugation table, rolled up until opened
    TenseChoice.tsx       picking a tense, or naming a new one
    Modal.tsx             overlay panel
    Badges.tsx            source, collection, topic and needs-definition pills
  lib/
    home.ts               what the dashboard shows, as pure functions
    homeData.ts           the dashboard's server-side reads
    site.ts               the site's URL, name, description and landing questions
    flashcards.ts         decks, cards, answers: the flashcard feature's data access
    judgeAnswer.ts        whether what was typed counts as the answer
    remoteStore.ts        the Supabase factory all four list stores are built on
    supabaseClient.ts     the browser client, session kept in cookies
    supabaseServer.ts     the server client, and the verified "who is asking?"
    session.ts            who is signed in, and signing in, up, out and changing a password
    authLinkError.ts      why a sign-in link did not sign you in
    constants.ts          limits, and what a new account's lists start out as
    types.ts              Entry, Phrase and VerbTable shapes plus validators
    storage.ts            the word store, and how a word is written to a file
    phraseStorage.ts      the phrase store, and the same for a phrase
    verbTables.ts         the conjugation tables, and the same for a table
    rules.ts              the grammar rule store, and the same for a rule
    blocks.ts             a rule's blocks: shapes, limits and validation
    blockText.ts          the markup a rule's text accepts
    selectionEdits.ts     what highlighting and linking a selection do to the text
    backup.ts             one backup file covering all four lists
    backupFile.ts         download plumbing: builds the .xlsx and .json files
    planImport.ts         what merging a backup into a list means, as a pure function
    settings.ts           the account's display name, language and editable lists
    languages.ts          the language menu and the ready-made skip lists
    settingsSections.ts   the four groups Settings is divided into
    exportFolder.ts       the chosen export folder, held in IndexedDB
    links.ts              where a [[Name]] points, in the fixed order
    linkRenames.ts        rewriting links when their target is renamed
    useLinkTargets.ts     React binding for every link target
    useWords.ts           React binding for the word store
    usePhrases.ts         React binding for the phrase store
    useVerbTables.ts      React binding for the conjugation tables
    useRules.ts           React binding for the rule store
    useSettings.ts        React binding for the settings row
    useSorting.ts         the account's sorting rules, for a list page
    useSession.ts         React binding for the session store
    useExportFolder.ts    React binding for the export folder
    useListPage.ts        the bookkeeping every list page does around its rows
    useListSelection.ts   row selection shared by both list pages
    useWideScreen.ts      table or cards, decided once rather than per row
    collectionOptions.ts  the collections a list's filter offers
    inUse.ts              how many items use each name, for the Settings bins
    refSuggestions.ts     the names a Ref field offers to complete
    foldName.ts           the one way a name is folded before it is compared
    sortName.ts           sorting in the chosen language, past a leading skip word
    renames.ts            renaming a name on a Settings list, and on what carries it
    enterMovesDown.ts     which field is below, by position on screen
    parseWord.ts          the paste-to-split rule
    parseRef.ts           turns a Ref value into text and link tokens
    format.ts             date formatting
  types/
    file-system-access.d.ts  the folder picker, which lib.dom does not describe
e2e/
  fixtures.ts             signs in as the test account, on localhost only
  landing/                the landing page is public
  home/                   the dashboard
  vocabulary/             adding, finding and deleting a word
  specs/                  a plan per spec
playwright.config.ts      Playwright: base URL, one worker
assets/
  captured-logo.png       the full-size logo artwork, not served
public/
  captured-logo.png       the 256px copy the nav bar loads
  captured-logo-bg.png    the 1000px copy the backdrop loads
  llms.txt                a plain-text description for LLMs
supabase/
  config.toml             CLI project config
  migrations/             the tables, indexes, functions and row level security policies
  tests/home_summary.sql  a rolled-back rehearsal of home_summary on the local copy
Docs/
  schema.md               the schema, and why it is shaped that way
  db-refactor-plan.md     how the schema reached its current shape
  homepage.md             the landing page and dashboard design
  grammar.md              the grammar rules design
  plans/                  implementation plans, kept for the record
  layouts_and_pages.md    notes on Next.js routing, kept for reference
```

Unit tests sit beside the code they test, as `*.test.ts` and `*.test.tsx`.
`assets/` holds source art that is not served; `public/` holds what the browser
downloads, so the logo is kept there at the size it is actually shown rather than
at full resolution. The nav loads it through `next/image`, with width and height
given so the bar does not jump while the file arrives.
