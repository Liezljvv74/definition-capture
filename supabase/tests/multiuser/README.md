# Multi user test

Checks that no account can reach another account's data. Three accounts (A, B
and C, `usera@multiuser.test` and so on) each get a row in every table, then
each tries to get at the other two accounts' data, first straight through the
database with its own login token, then through the app in a real browser.
First run on 7 October 2026: 626 of 626 checks passed
(`Reports/Multi user test.pdf`).

Run it after any change to the database: a new table, a changed policy or
grant, or a new function. It runs on the **local** Supabase copy only: the
live sign-up has a captcha, and test accounts do not belong in production.
`parity.sql` shows whether the result holds for the live project.

## Running it

From the project folder, with Docker running.

1. Start the local copy and bring it up to date:

   ```bash
   npx supabase start
   npx supabase migration up --local
   ```

2. Database layer (562 checks). The script deletes any earlier
   `@multiuser.test` accounts first, so it can be rerun:

   ```bash
   export PUB=$(npx supabase status -o env | grep '^PUBLISHABLE_KEY=' | cut -d'"' -f2)
   node supabase/tests/multiuser/db-test.cjs
   ```

3. App layer (64 checks). Point the app at the local copy with a temporary
   `.env.development.local` (as for the end-to-end tests in CLAUDE.md), start
   it, and run:

   ```bash
   eval "$(npx supabase status -o env | grep -E '^(API_URL|PUBLISHABLE_KEY)=')"
   printf 'NEXT_PUBLIC_SUPABASE_URL=%s\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=%s\nNEXT_PUBLIC_TURNSTILE_SITE_KEY=\n' "$API_URL" "$PUBLISHABLE_KEY" > .env.development.local
   npm run dev            # in another terminal; needs port 3000
   node supabase/tests/multiuser/app-test.cjs
   ```

   The search checks embed a query through OpenRouter with the key in
   `.env.local` (a fraction of a cent); nothing else calls a model.

4. Same protections as live? Compare the fingerprints:

   ```bash
   docker exec -i supabase_db_Captured psql -U postgres -t -A < supabase/tests/multiuser/parity.sql
   npx supabase db query --linked "$(cat supabase/tests/multiuser/parity.sql)"
   ```

5. Clean up: stop the dev server, delete `.env.development.local`, remove the
   test accounts, and stop the local copy:

   ```bash
   docker exec -i supabase_db_Captured psql -U postgres -c "delete from auth.users where email like '%@multiuser.test'"
   npx supabase stop
   ```

Both scripts print a pass count and every failure, and write their results to
`test-results/multiuser/` (git-ignored).

## What counts as a pass

A read returns none of the other account's rows; a change or delete affects 0
of their rows; an insert or link is refused for an **access** reason
(permission denied, 42501, or a link across accounts refused, 23503). A
refusal for a data rule (23514) or a duplicate key (23505) counts as
inconclusive, not a pass. Afterwards every account's rows must be unchanged
(fingerprinted before and after).

## Checking the test still catches a leak

Switch one table's protection off on the local copy, rerun step 2, and expect
failures; then switch it back on:

```bash
docker exec -i supabase_db_Captured psql -U postgres -c "alter table public.tags disable row level security"
node supabase/tests/multiuser/db-test.cjs     # expect failures on tags
docker exec -i supabase_db_Captured psql -U postgres -c "alter table public.tags enable row level security"
```

## When the schema changes

`db-test.cjs` lists the tables in `TABLES` and seeds one row of each per
account. A new table needs adding there (its seed row, an insert row in
`insertRow` and a column in `updateSet`); a new function that takes an item,
tag or source belongs in the "Database functions" section.
