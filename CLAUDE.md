@AGENTS.md

# Captured

The app was called Definition Capture until 3 October 2026; the repository,
the Vercel project and the `definition-capture.vercel.app` domain keep that
name, and so do two identifiers that must not change: the backup file's
`format` (`definition-capture-backup`, which old files carry) and the
IndexedDB name holding the export folder permission.

A personal glossary: words, phrases, verb conjugation tables and grammar rules, private to
each signed-in account. Every list is stored in Supabase and scoped to its
owner.

## Stack

| | |
| --- | --- |
| Framework | Next.js 16.3.4, App Router, Turbopack |
| UI | React 19.2.8, TypeScript 5, Tailwind CSS 4 |
| Data and auth | Supabase: Postgres with row level security, and Supabase Auth |
| Captcha | Cloudflare Turnstile, verified by Supabase Auth |
| Tutor | OpenRouter, called with `fetch` from `POST /api/tutor`, `/api/tutor/merge` and `/api/tutor/search`; `OPENROUTER_MODEL` picks the model, default `anthropic/claude-sonnet-5.5`; embeddings `baai/bge-m3` through OpenRouter, in pgvector |
| Supabase clients | `@supabase/ssr` 0.12 (browser and server), `@supabase/supabase-js` 2.116 |
| Exports | `write-excel-file` for the .xlsx backup, imported on demand |
| Tests | Vitest 3, in the node environment; `npx vitest run` |
| End-to-end tests | Playwright Test 1.63, in `e2e/`; `npm run e2e`, on localhost for signed-in tests |
| Tooling | Supabase CLI 2.118, ESLint 9 |
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
- **Turnstile needs its site key in Vercel too.** `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  is public, like the two Supabase values; the secret key belongs in the Supabase
  dashboard only.
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
  redirects a request with no session to the landing page, `/` (everybody signed
  out starts there, existing account or not). It is named `proxy.ts`
  because **Next 16 renamed the `middleware.js` convention to `proxy.js`**.
- `src/app/(workspace)/layout.tsx` asks again, on the server, before any page in
  the group renders.

The second is not redundant. Narrow the proxy's matcher by accident and every
page behind it swings open; the layout check sits with the pages it protects.

**Captcha is Cloudflare Turnstile, verified by Supabase.** The five Auth calls a
bot could abuse (`signUp`, `signInWithPassword` in sign-in and in the
current-password check of `changePassword`, `resetPasswordForEmail`,
`signInWithOtp`) each take an optional `captchaToken` in `src/lib/session.ts`,
and `src/components/Turnstile.tsx` produces it. With no
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` the widget renders nothing and no token is
sent. Supabase ignores a token while captcha is off in the dashboard
(Authentication, Attack Protection, Turnstile, secret key), so the order of
release matters: **deploy the code first, then enable captcha in Supabase**, or
every sign-in is refused. The site key must list `definition-capture.vercel.app`
and `localhost` as hostnames. The secret key never enters code, `.env.local` or
Vercel.

Once captcha is on, `.env.local` points at the live project, so local
development against it needs `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in `.env.local`
(localhost is a listed hostname on the widget); with no key every sign-in is
refused.

**Use `getClaims()`, never `getSession()`, in server code.** A session read out of
a cookie is a claim made by whoever sent the request, and cookies can be forged.
`getClaims()` verifies the token's signature, locally, against the project's
public JWKS, since this project signs with an asymmetric ECC key. `serverUserId()`
in `src/lib/supabaseServer.ts` is the wrapper to use.

**Workspace routes require a signed-in user.** Everything except the public
landing page `/`, `/sign-in`, `/sign-up`, `/auth/*` and the crawler files
(`robots.txt`, `sitemap.xml`, `llms.txt`, `opengraph-image`) lives under
`src/app/(workspace)/`. `/` is matched exactly in `isPublic` in `src/proxy.ts`,
since as a prefix it would make every path public, and the crawler files are
excluded in the proxy's matcher. A new page belongs inside the group. Putting
one outside it, at the top level, leaves it unprotected, and a new public route
must be added to the proxy's public handling (`PUBLIC_PATHS`, or the matcher for
a file) as well as placed outside the group.

**No service-role key in client-accessible env vars.** Anything named
`NEXT_PUBLIC_*` is compiled into the browser bundle. Only the project URL and the
publishable key belong there. The project currently holds no service-role key at
all: legacy JWT-based API keys are disabled, and the one Edge Function that used
to need the service role has been deleted.

**`OPENROUTER_API_KEY` is server-only.** It is read in `src/lib/tutorServer.ts`
and nowhere else, for `POST /api/tutor`, `/api/tutor/merge` and `/api/tutor/search`, and
it never gets a `NEXT_PUBLIC_` name, which would put a paid key in every
visitor's browser. It also embeds for search and memory. In Vercel it is a Sensitive variable.
`TUTOR_SIGNING_SECRET`, also server-only and Sensitive in Vercel, keys the signatures on the tutor's answers (`signTurn`), which keep a made-up earlier answer from reaching the model; changing it leaves older answers shown and searchable but no longer history, memory or mergeable. `OPENROUTER_MODEL` is
the one setting that switches the model of both, in `.env.local` and in Vercel;
unset, it is `DEFAULT_TUTOR_MODEL` in `tutor.ts`. An account is marked paid by adding an `account_plans` row with
`plan = 'paid'` in the Supabase dashboard: no policy lets an account write its
own plan.

**The session lives in cookies, not `localStorage`.** `createBrowserClient` from
`@supabase/ssr` puts it there, which is what lets the server see the same session
the browser holds. Do not swap in `createClient` from `@supabase/supabase-js`;
that stores the session where no server can read it, and every server-side check
above silently stops working.

## Data rules

**No note data in `localStorage` or `sessionStorage`, under any circumstances.**
Words, phrases, verb tables, grammar rules, and settings live in Supabase, and nothing in `src/`
writes a note anywhere else. The one module that ever read from browser storage,
`legacyLocal.ts`, is gone along with the prompt that offered its contents to an
account: it existed to carry data across from before this app had accounts, and
that crossing is long finished.

**An account holds at most 2,000 tutor exchanges and 500 conversations**, enforced by `enforce_row_limit` triggers, and may search 100 times an hour (`tutor_searches`, cleared nightly by the pg_cron job `tutor-searches-cleanup`). The free plan's 500 MB is the reason; watch Dashboard, Usage, and move to Pro before about 350 MB.

**Row level security is load-bearing.** List queries run in the browser under the
publishable key, so RLS is what separates one account's rows from another's. Every
table has RLS enabled and policies checking `(select auth.uid()) = user_id`,
including `with check` on insert and update. A new table gets the same treatment
in the same migration that creates it.

**`src/lib/remoteStore.ts` is the only thing that talks to Supabase for list
data.** All four list stores are built from that one factory, so they cannot drift
apart in how they load, save, or report failure. Each reads its own `item_type` out
of `items` and writes through the `save_items` function, one transaction per call;
every delete is limited to its type as well as its ids, because the four lists
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
added.** Sixteen tables, no views, and twelve functions, none of them `security
definer`: `items` holds every word, phrase, verb table and grammar rule, with a check per type
on its detail columns; `tags`, `item_tags` and `sources` label them; `decks`,
`deck_cards`, `progress` and an append-only `reviews` carry the flashcards, and
`verb_tense_progress` the per-tense schedule of verb practice; and
`user_settings` is one row of preferences; `account_plans` and `tutor_usage` carry the grammar tutor's plan and use, and `tutor_conversations`, `tutor_exchanges`, `tutor_conversation_rules` and `tutor_searches` the tutor's saved conversations, searchable through `search_tutor`. Every owned row carries `user_id`, and
composite foreign keys `(x_id, user_id)` make a link between two accounts' rows
impossible. `Docs/db-refactor-plan.md` records how the schema got here and why.

**Marking an account paid:** in the Supabase dashboard, insert or update a row
in `account_plans` with the account's user id and `plan = 'paid'`; the app can
read it but never write it.

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

The end-to-end tests in `e2e/` sign in to a dedicated test account, whose
`E2E_EMAIL` and `E2E_PASSWORD` sit in `.env.local`, and add and delete rows in
it. Signed-in tests cannot solve the captcha that protects the live project, so
they run against the local Supabase copy only, and the fixture skips them unless
the base URL is localhost. To run them: `npx supabase start`; a temporary
`.env.development.local` pointing `NEXT_PUBLIC_SUPABASE_URL` and the publishable
key at the local stack (from `npx supabase status`) with
`NEXT_PUBLIC_TURNSTILE_SITE_KEY=` empty; an E2E account created in that local
database through `/sign-up` on localhost (local email confirmation is off);
`E2E_EMAIL` and `E2E_PASSWORD` set in the shell for that run; then `npm run dev`
restarted, because the CSP's `connect-src` is built at server start, and
`E2E_BASE_URL=http://localhost:3000`. Delete `.env.development.local` and run
`npx supabase stop` afterwards. Only `e2e/landing/landing-is-public.spec.ts`
runs against production. Each test starts from the
sign-in in `e2e/fixtures.ts`, and its plan lives in `e2e/specs/`.

A test for anything that can lose data is worth breaking on purpose before you
trust it. The suites around importing and around `remoteStore`'s write path exist
because the behaviour they cover fails silently, and each was checked by mutating
the source and confirming the tests noticed.
