@AGENTS.md

# Definition Capture

A personal glossary: terms, phrases, and verb conjugation tables, private to each
signed-in account. Every list is stored in Supabase and scoped to its owner.

## Stack

| | |
| --- | --- |
| Framework | Next.js 16.3.4, App Router, Turbopack |
| UI | React 19.2.8, TypeScript 5, Tailwind CSS 4 |
| Data and auth | Supabase — Postgres with row level security, and Supabase Auth |
| Supabase clients | `@supabase/ssr` 0.12 (browser and server), `@supabase/supabase-js` 2.116 |
| Exports | `write-excel-file` for the .xlsx backup |
| Tooling | Supabase CLI 2.117, ESLint 9 |

`npm run dev` serves on **port 3000**, pinned in `package.json`. The port is not
arbitrary: a sign-in link only returns to an origin listed under Authentication →
URL Configuration → Redirect URLs in the Supabase dashboard, and
`http://localhost:3000/auth/callback` is the one registered. Starting on another
port bounces every link.

There is no deployment at the moment. The app used to be a static export on
GitHub Pages; that was given up to get a server, because a static host cannot
check a session. That era is over and its remains have been deleted — the Pages
workflow, the committed `out/` build, and the `asset()` base-path helper. Any
host for this app has to run Node, and nothing should be designed around the
absence of a server.

## Authentication rules

These are rules, not preferences. Breaking any of them reopens a hole that was
deliberately closed.

**Supabase handles all sign-in and session handling.** Sign-in goes through
`supabase.auth.signInWithPassword` or `signInWithOtp`; sessions are created,
refreshed, and ended by Supabase. Do not build a parallel notion of "logged in".

**No custom password handling.** No password is ever stored, compared, hashed, or
validated by this app. Setting one goes through `supabase.auth.updateUser`, in
`setPassword` in `src/lib/session.ts`. Do not add a password field to any table.

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
`getClaims()` verifies the token's signature — locally, against the project's
public JWKS, since this project signs with an asymmetric ECC key. `serverUserId()`
in `src/lib/supabaseServer.ts` is the wrapper to use.

**Workspace routes require a signed-in user.** Everything except `/sign-in`,
`/sign-up` and `/auth/*` lives under `src/app/(workspace)/`. A new page belongs
inside that group. Putting one outside it, at the top level, leaves it
unprotected — and a new public route must be added to `PUBLIC_PATHS` in
`src/proxy.ts` as well as placed outside the group.

**No service-role key in client-accessible env vars.** Anything named
`NEXT_PUBLIC_*` is compiled into the browser bundle. Only the project URL and the
publishable key belong there. The project currently holds no service-role key at
all — legacy JWT-based API keys are disabled, and the one Edge Function that used
to need the service role has been deleted.

**The session lives in cookies, not `localStorage`.** `createBrowserClient` from
`@supabase/ssr` puts it there, which is what lets the server see the same session
the browser holds. Do not swap in `createClient` from `@supabase/supabase-js`;
that stores the session where no server can read it, and every server-side check
above silently stops working.

## Data rules

**No note data in `localStorage` or `sessionStorage`, under any circumstances.**
Terms, phrases, verb tables, and settings live in Supabase. The one module that
touches `localStorage` is `src/lib/legacyLocal.ts`, which exists only to read
pre-account data out of an old browser and import it, and then delete it.

**Row level security is load-bearing.** List queries run in the browser under the
publishable key, so RLS is what separates one account's rows from another's. Every
table has RLS enabled and policies checking `(select auth.uid()) = user_id`,
including `with check` on insert and update. A new table gets the same treatment
in the same migration that creates it.

**`src/lib/remoteStore.ts` is the only thing that talks to Supabase for list
data.** Both stores are built from that one factory, so they cannot drift apart in
how they load, save, or report failure. Writes are optimistic: the screen updates
first, and a failure reloads the list and puts a message in the banner.

**Migrations are imperative and hand-written.** Create one with
`npx supabase migration new <name>` — never invent a filename — and apply with
`npx supabase db push`. There is no `supabase/schemas/`, so this is not a
declarative-schema project.

## Conventions

Comments explain *why*, not *what*, and are written in full sentences. The
existing code is dense with them; match that. A comment that records a decision
and the alternative it rejected is worth keeping.

Check work with `npx tsc --noEmit` and `npx eslint src/`, and `npm run build` when
routing or rendering changed — the build's route table shows which routes are
static and which are server-rendered, which is how you confirm a protected page is
still dynamic.
