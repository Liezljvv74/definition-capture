@AGENTS.md

# Definition Capture

A personal glossary: words, phrases, and verb conjugation tables, private to
each signed-in account. Every list is stored in Supabase and scoped to its
owner.

## Stack

| | |
| --- | --- |
| Framework | Next.js 16.3.4, App Router, Turbopack |
| UI | React 19.2.8, TypeScript 5, Tailwind CSS 4 |
| Data and auth | Supabase: Postgres with row level security, and Supabase Auth |
| Supabase clients | `@supabase/ssr` 0.12 (browser and server), `@supabase/supabase-js` 2.116 |
| Exports | `write-excel-file` for the .xlsx backup, imported on demand |
| Tests | Vitest 3, in the node environment; `npx vitest run` |
| Tooling | Supabase CLI 2.117, ESLint 9 |
| Hosting | Vercel, deployed from GitHub on every push to `main` |

`npm run dev` serves on **port 3000**, pinned in `package.json`. The port is not
arbitrary: a sign-in link only returns to an origin listed under Authentication →
URL Configuration → Redirect URLs in the Supabase dashboard, and
`http://localhost:3000/auth/callback` is the one registered. Starting on another
port bounces every link.

## Deployment

The app is hosted on **Vercel**, as the `definition-capture` project, and
production is **https://definition-capture.vercel.app**. Vercel's GitHub
integration builds and deploys every push to `main` on `origin`
(`Liezljvv74/definition-capture`) on its own, usually within a minute or two,
and reports back to GitHub: `vercel[bot]` records each one as a Production
deployment on the commit. So pushing to `main` is releasing. There is nothing
else to run, and nothing to run it from this repository.

A few things follow from that:

- **Migrations are not part of a deploy.** Vercel builds the Next.js app and
  nothing else. `npx supabase db push` applies a migration to the one live
  Supabase project that local development and production both use, and it has
  to happen before code that needs it reaches `main`, or production breaks
  with it. Push the migration first, then the code.
- **The environment variables live in Vercel too.** The build reads
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from
  the project's Environment Variables in the Vercel dashboard, not from
  `.env.local`, which is never committed. The same no-service-role rule
  applies there.
- **Emailed links need the production origin registered.** Supabase only
  returns a sign-in or reset link to a URL listed under Authentication, URL
  Configuration, Redirect URLs, and localhost alone does not cover the live
  site. `https://definition-capture.vercel.app/auth/callback` and
  `https://definition-capture.vercel.app/auth/reset` have to be listed beside
  the localhost ones, and the Site URL should be the production origin.
  Password sign-in does not depend on this.
- **Per-deployment URLs are private.** Each deploy also gets its own
  `definition-capture-<hash>-liezl.vercel.app` address, which Vercel puts
  behind its own login. Only the production domain is public.

The app used to be a static export on GitHub Pages; that was given up to get a
server, because a static host cannot check a session. That era is over and its
remains have been deleted: the Pages workflow, the committed `out/` build, and
the `asset()` base-path helper. Any host for this app has to run Node, and
nothing should be designed around the absence of a server.

## Authentication rules

These are rules, not preferences. Breaking any of them reopens a hole that was
deliberately closed.

**Supabase handles all sign-in and session handling.** Sign-in goes through
`supabase.auth.signInWithPassword` or `signInWithOtp`; sessions are created,
refreshed, and ended by Supabase. Do not build a parallel notion of "logged in".

**No custom password handling.** No password is ever stored, compared, hashed, or
validated by this app. Setting one goes through `supabase.auth.updateUser`, in
`setPassword` in `src/lib/session.ts`. Do not add a password field to any table.

Three paths reach it, and the difference between them is what each one accepts as proof.
`changePassword` is Settings: it asks for the current password and checks it by calling
`signInWithPassword`, because a session on its own may be a browser somebody walked away
from. `sendPasswordReset` emails a link to `/auth/reset`, which exchanges the code and sends
the reader to `/choose-password`; that form asks for no old password, because reading the
account's email is the proof. Every one of them ends by signing out other sessions. The
reset route needs `http://localhost:3000/auth/reset` listed under Authentication, URL
Configuration, Redirect URLs, beside the callback.

**Verify the session on the server before any protected page loads.** Two places
do this, and both must keep doing it:

- `src/proxy.ts` runs before every request, refreshes the session cookies, and
  redirects a request with no session to `/sign-in`. It is named `proxy.ts`
  because **Next 16 renamed the `middleware.js` convention to `proxy.js`**.
- `src/app/(workspace)/layout.tsx` asks again, on the server, before any page in
  the group renders.

The second is not redundant. Narrow the proxy's matcher by accident and every
page behind it swings open; the layout check sits with the pages it protects.

**Use `getClaims()`, never `getSession()`, in server code.** A session read out of
a cookie is a claim made by whoever sent the request, and cookies can be forged.
`getClaims()` verifies the token's signature, locally, against the project's
public JWKS, since this project signs with an asymmetric ECC key. `serverUserId()`
in `src/lib/supabaseServer.ts` is the wrapper to use.

**Workspace routes require a signed-in user.** Everything except `/sign-in`,
`/sign-up` and `/auth/*` lives under `src/app/(workspace)/`. A new page belongs
inside that group. Putting one outside it, at the top level, leaves it
unprotected, and a new public route must be added to `PUBLIC_PATHS` in
`src/proxy.ts` as well as placed outside the group.

**No service-role key in client-accessible env vars.** Anything named
`NEXT_PUBLIC_*` is compiled into the browser bundle. Only the project URL and the
publishable key belong there. The project currently holds no service-role key at
all: legacy JWT-based API keys are disabled, and the one Edge Function that used
to need the service role has been deleted.

**The session lives in cookies, not `localStorage`.** `createBrowserClient` from
`@supabase/ssr` puts it there, which is what lets the server see the same session
the browser holds. Do not swap in `createClient` from `@supabase/supabase-js`;
that stores the session where no server can read it, and every server-side check
above silently stops working.

## Data rules

**No note data in `localStorage` or `sessionStorage`, under any circumstances.**
Words, phrases, verb tables, and settings live in Supabase, and nothing in `src/`
writes a note anywhere else. The one module that ever read from browser storage,
`legacyLocal.ts`, is gone along with the prompt that offered its contents to an
account: it existed to carry data across from before this app had accounts, and
that crossing is long finished.

**Row level security is load-bearing.** List queries run in the browser under the
publishable key, so RLS is what separates one account's rows from another's. Every
table has RLS enabled and policies checking `(select auth.uid()) = user_id`,
including `with check` on insert and update. A new table gets the same treatment
in the same migration that creates it.

**`src/lib/remoteStore.ts` is the only thing that talks to Supabase for list
data.** All three list stores are built from that one factory, so they cannot drift
apart in how they load, save, or report failure. Each reads its own `item_type` out
of `items` and writes through the `save_items` function, one transaction per call;
every delete is limited to its type as well as its ids, because the three lists
share one table. `src/lib/settings.ts` deliberately does not use it, being one row
with no id and no order, but it shares the functions where drifting would be a bug.
Writes are optimistic: the screen updates first, and a failure reloads the list and
puts a message in the banner.

**A backup file has a declared shape, and the old spellings still have to
read.** Each list has a `toWire` beside its `parse`, and `buildBackup` maps
through them, so renaming a field on a domain type is a compile error rather
than a silent change to the format everyone's saved files use. Three things that
look like leftovers are not: `parseBackup` accepting `entries` as well as
`words`, `parseEntry` accepting `term` as well as `word`, and every reader
accepting `categories` as well as `collections`. Backups before version 6 spell
the first two the old way and backups before version 10 the third, and those
files are still in people's Downloads folders. There are tests that fail if any
of them is dropped.

**A Replace restore keeps what it replaces.** `replaceAll` saves the file over
the list and then deletes only the rows the file lacks, and `planImport` gives
each file item the id of the row it replaces (by name, else by id). Deleting
first, as it once did, cascaded into every item's review history and schedule.

**The glossary is called Vocabulary and its items are words.** The label and the
identifiers behind it do not all agree, deliberately. A word is a row of `items`
with `item_type = 'word'` and its text in `title`; the routes are `/vocabulary` and
`/word?id=`, but `/terms` and `/term?id=` still redirect to them, `parseEntry`
still reads a `term` field, and the `Entry` type keeps the name it had three
renames ago, from when the table was `entries`. Check what a name actually reaches
before renaming it.

**What the app calls a Collection is a tag.** An item can be in up to five and a
collection holds many items, so it is a row of `tags` with `context =
'collection'`, linked through `item_tags`. Tags have a context because they are
expected to serve other purposes later. The word "category" is retired, in the
interface and in code, except where an old backup file is read. A source is not a
tag: an item has at most one, so it is a row of `sources` that `items.source_id`
points at. A collection or source still in use cannot be deleted; the database
refuses it and Settings switches the bin off.

**`Docs/schema.md` is the design of record, and it is read before a table is
added.** Nine tables, no views, and seven functions, none of them `security
definer`: `items` holds every word, phrase and verb table, with a check per type
on its detail columns; `tags`, `item_tags` and `sources` label them; `decks`,
`deck_cards`, `progress` and an append-only `reviews` carry the flashcards; and
`user_settings` is one row of preferences. Every owned row carries `user_id`, and
composite foreign keys `(x_id, user_id)` make a link between two accounts' rows
impossible. `Docs/db-refactor-plan.md` records how the schema got here and why.

A new kind of item is a value in the `item_type` check, its detail columns with a
check, a branch in `items.has_answer` and the same branch in `cardBack`, and its
fields in `save_items`. The `has_answer` branch is what makes it produce
flashcards, and nothing will tell you if it is left out.

**Migrations are imperative and hand-written.** Create one with
`npx supabase migration new <name>` (never invent a filename) and apply with
`npx supabase db push`. There is no `supabase/schemas/`, so this is not a
declarative-schema project.

## Conventions

Comments explain *why*, not *what*, and are written in full sentences. The
existing code is dense with them; match that. A comment that records a decision
and the alternative it rejected is worth keeping.

Check work with `npx tsc --noEmit`, `npx eslint src/` and `npx vitest run`, and
`npm run build` when routing or rendering changed: the build's route table shows
which routes are static and which are server-rendered, which is how you confirm a
protected page is still dynamic.

A test for anything that can lose data is worth breaking on purpose before you
trust it. The suites around importing and around `remoteStore`'s write path exist
because the behaviour they cover fails silently, and each was checked by mutating
the source and confirming the tests noticed.
