# Database refactor plan

Status: **done, and live since 2026-09-25.** Steps 0 to 3 were first run
against a local copy of the live database (Docker): both migrations applied
with every assertion passing, the rollback script was tested, and the app was
driven through a browser against the result before and after step 3. The live
rollout then followed the same steps: a fresh backup and pre-flight, step 1,
the app deployed from `main` and checked on production, then step 3. The
advisors afterwards showed no security findings from the schema; the one
remaining warning, leaked password protection, is a dashboard setting.

## Where the implementation differs from the plan below

Decisions made while building, which supersede the text further down:

- **A collection or source still in use cannot be removed.** The owner chose
  this over clearing it from items. The foreign keys from `item_tags` to
  `tags` and from `items` to `sources` are `on delete no action deferrable
  initially deferred`: an app request (its own transaction) that deletes one
  in use is refused, while deleting a whole account still cascades cleanly.
  Settings switches the bin off and says how many words and phrases use it.
  A restore keeps any collection or source its words still use.
- **Function names:** `rename_tag(context, from, to)` and
  `rename_item_source(from, to)` instead of `merge_tag` and `merge_source`.
  They rename, or merge when the new name exists, and take names because
  Settings holds names. A plain rename is not a client `update`.
- **`reviews` keeps its schedule snapshot** (`prior_ease`,
  `prior_interval_days`, `next_due_at`) for a history-of-improvement view.
- **The collection limit is 5**, not 3.
- **Verb tables carry no source.** The old schema gave every verb table
  'Manual' without asking and never showed it.
- **`verb_rows`** is the column name for a verb table's rows (the plan said
  `conjugations`).
- **`save_items` accepts `created_at` and `updated_at`** for new rows, so a
  restored backup keeps its dates.
- **Replace restore matches file items to existing rows by name, then by
  id**, so a backup whose ids differ (another device, items re-created) still
  saves over the right rows instead of failing on a duplicate name.
- **Settings reads collections and sources from their tables**; an account
  with none still sees the defaults, which are created on first edit.
- **Backups are version 10** and write `collections`; `categories` still reads.
- **`anon` also loses execute granted through `PUBLIC`**, which three old
  trigger functions still carried.

Decisions already made by the owner: app code changes alongside the database;
the live project holds only the owner's data, which must be kept (ids
included); flashcards stay; migrations go to the live project with `db push`;
downtime is acceptable.

**Naming decision (2026-09-25):** what the app calls a *Category* is really a
*tag*, because it is many-to-many. The data model uses a generic `tags` table
with a `context` column, so tags can serve other purposes later; `collection`
is the first context. In the interface, **"Category" becomes "Collection"
everywhere.**

Inputs: a full read of `Docs/schema.md`, all 31 migrations and every database
call in `src/` (ai-researcher); a security audit of the current schema
(supabase-security-auditor); a target design (ai-architect); the
`supabase-postgres-best-practices` references; and a live
`supabase db advisors --linked` run.

---

## 1. What is wrong today

| Problem | Evidence |
| --- | --- |
| **15 tables, 5 of them doing nothing.** `user_goals` and `study_sessions` are never touched; `daily_study` and `review_logs` are written and never read; `flashcard_decks` has five columns nobody reads. | researcher usage map |
| **The "temporary" compatibility views are the main path.** `words`, `phrases` and `verb_tables` plus three instead-of triggers carry every list read and write. Each save fans out into 3 to 4 statements. | `findings.sql:81-123`, `faces.sql:73-155` |
| **Saving many rows is one request per row**, because a view cannot take `on conflict` (42P10). Every update deletes and re-inserts the item's categories even when they did not change. | `remoteStore.ts:567-594`, `storage.ts:134` |
| **A Replace import erases review progress** for every item it replaces, even when the same ids come straight back. | `remoteStore.ts:519-529` plus cascades |
| **Facts stored twice.** Categories live in `user_settings.categories` and in `tags`, synced by a fire-and-forget RPC. `tags.position` repeats alphabetical order. Source names are free text copied onto every item, so renaming one rewrites rows. | `settings.ts:449-451`, `rename_source.sql` |
| **Constraints lost in the move to the spine:** max 3 categories per item, max 12 tenses, source not blank. `updated_at` is set by the browser, can be nulled, and means something different per type. | legacy migrations vs `spine.sql` |
| **Ownership only implied** on detail and join tables, so every RLS check is a correlated `exists` per row, and each is evaluated twice because of duplicate permissive policies on 9 tables. | advisor, `spine.sql:184-233` |
| **Security (no critical or high):** `anon` still holds table grants on everything; `apply_review` is SECURITY DEFINER in the exposed schema yet trusts the browser's verdict; `item_type` and `created_at` are client-mutable; leaked password protection is off. | audit M1, M2, L1, L2 |
| **Leftovers:** `item_types` (only `key` is read, routes are stale), `learning_items.metadata`, `card_faces` (unindexable filter, and it emits an em dash), stale comments. | researcher section 3e |

---

## 2. Target schema

### Principles

1. **One row per item, in one table.** Three kinds of item with five detail
   fields between them do not justify three detail tables, three views and
   three triggers. Checks keep each field on its own type.
2. **Every fact has one home.** Tags and sources become rows that items
   point at. Nothing is kept in step by a second copy.
3. **The app writes base tables.** No views, no instead-of triggers. Batched
   writes and real upserts become possible.
4. **Every owned row carries `user_id`, and the database proves it agrees with
   its parent** through composite foreign keys `(x_id, user_id)`. RLS becomes
   one indexed equality; a cross-account link cannot exist.
5. **One policy per command.** No `for all` beside a `select`.
6. **Keep only what something reads.** Scaffolding for features with no screen
   is cut; it can come back in a migration when the screen does.
7. **Timestamps belong to the database.** A shared trigger sets `updated_at`.

### Tables (15 → 9)

```sql
-- Settings: one row per account. Collections (tags) and sources move to their own tables.
user_settings (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  language text not null default '', language_other text not null default '',
  verb_persons text[] not null default '{}', verb_tenses text[] not null default '{}',
  answer_separators text not null default ',/()',
  sort_skip_words text[] not null default '{}',
  updated_at timestamptz not null default now()          -- set by trigger
  -- existing checks kept as they are
)

-- Generic tags. context says what a tag is for; 'collection' is the only one today.
-- Adding a context later is one change to the check, no new table.
tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  context text not null check (context in ('collection')),
  name text not null check (name = btrim(name) and name <> '' and length(name) <= 60),
  created_at timestamptz not null default now(),
  unique (id, context, user_id)                          -- target for item_tags' composite FK
)
  unique index tags_user_context_name_key on (user_id, context, lower(name))

-- One source per item, so a plain lookup table rather than a tag context.
sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (name = btrim(name) and name <> '' and length(name) <= 60),
  created_at timestamptz not null default now(),
  unique (id, user_id)
)
  unique index sources_user_name_key on (user_id, lower(name))

-- Replaces learning_items + word_details + phrase_details + verb_table_details + item_types.
items (
  id uuid primary key default gen_random_uuid(),          -- existing ids copied as they are
  user_id uuid not null references auth.users on delete cascade,
  item_type text not null check (item_type in ('word','phrase','verb_table')),
  title text not null check (btrim(title) <> ''),
  ref text not null default '',
  source_id uuid,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),          -- set by trigger
  definition text,                                        -- word only
  literal_meaning text, usage_example text,               -- phrase only
  tenses text[], conjugations jsonb,                      -- verb_table only (was rows)
  has_answer boolean generated always as (...) stored,    -- replaces card_faces' back filter
  unique (id, user_id),
  foreign key (source_id, user_id) references sources (id, user_id)
    on delete set null (source_id),
  check ((item_type = 'word')       = (definition is not null)),
  check ((item_type = 'phrase')     = (literal_meaning is not null and usage_example is not null)),
  check ((item_type = 'verb_table') = (tenses is not null and conjugations is not null)),
  check (tenses is null or cardinality(tenses) <= 12),
  check (conjugations is null or (jsonb_typeof(conjugations) = 'array'
         and jsonb_array_length(conjugations) <= 30))
)
  unique index items_user_type_title_key on (user_id, item_type, lower(title))  -- one, not three partial
  index items_user_type_created_idx on (user_id, item_type, created_at desc, id desc)   -- list load
  index items_user_answerable_idx   on (user_id, item_type) where has_answer            -- deck build
  index items_source_idx            on (source_id)                                      -- FK set null

item_tags (
  item_id uuid not null, tag_id uuid not null, user_id uuid not null,
  context text not null,                                  -- copied from the tag, enforced by the FK
  position smallint not null check (position >= 1),       -- keeps the order tags were given
  check (context <> 'collection' or position <= 5),       -- max 5 collections per item (was 3)
  primary key (item_id, tag_id),
  unique (item_id, context, position),
  foreign key (item_id, user_id) references items (id, user_id) on delete cascade,
  foreign key (tag_id, context, user_id) references tags (id, context, user_id)
    on delete cascade on update cascade
)
  index item_tags_tag_idx on (tag_id, context, user_id)

decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  unique (id, user_id)
)
  index decks_user_created_idx on (user_id, created_at desc)

deck_cards (
  deck_id uuid not null, item_id uuid not null, user_id uuid not null,
  position int not null check (position >= 0),
  primary key (deck_id, position),
  unique (deck_id, item_id),
  foreign key (deck_id, user_id) references decks (id, user_id) on delete cascade,
  foreign key (item_id, user_id) references items (id, user_id) on delete cascade
)
  index deck_cards_item_idx on (item_id, user_id)          -- serves the cascade from items

progress (                                                -- was progress_summary, minus mastery
  item_id uuid primary key, user_id uuid not null,
  times_seen int not null default 0 check (times_seen >= 0),
  times_correct int not null default 0 check (times_correct between 0 and times_seen),
  streak int not null default 0 check (streak >= 0),
  lapses int not null default 0 check (lapses >= 0),
  ease numeric(4,2) not null default 2.50 check (ease >= 1.30),
  interval_days numeric(6,2) not null default 0 check (interval_days >= 0),
  due_at timestamptz, last_reviewed_at timestamptz,
  foreign key (item_id, user_id) references items (id, user_id) on delete cascade
)

reviews (                                                 -- was review_logs; new name avoids a clash in step 1
  id bigint generated always as identity primary key,     -- old ids kept with overriding system value
  item_id uuid not null, user_id uuid not null,
  reviewed_at timestamptz not null default now(),
  outcome text not null check (outcome in ('correct','again','revealed','skipped')),
  response_ms int check (response_ms is null or response_ms >= 0),
  prior_interval_days numeric(6,2), prior_ease numeric(4,2),   -- schedule snapshot, kept for
  next_due_at timestamptz,                                     -- a history-of-improvement view
  foreign key (item_id, user_id) references items (id, user_id) on delete cascade
)
  index reviews_item_idx on (item_id, user_id)            -- serves the cascade from items
  index reviews_user_reviewed_idx on (user_id, reviewed_at desc)   -- requirement 11
```

**Why `tags` has a `context`, and `item_tags` repeats it:** tags are expected
to be used for other things later. The context keeps each use apart (a name
can exist once per context) and lets each context set its own rules: the
limit of 5 applies to collections only. Copying `context` onto `item_tags`,
checked by the composite foreign key, is what lets the database enforce that
limit without a trigger.

**Why new names for `reviews`, `record_review` and `build_deck`:** step 1
builds the new schema beside the old one. A table or function that kept its
old name would have to be changed in place, which breaks the old schema,
turns rollback into a restore, and (for functions) leaves two overloads that
PostgREST refuses to choose between (PGRST203).

**Dropped:** `learning_items`, `word_details`, `phrase_details`,
`verb_table_details`, `item_types` (a check on `item_type` does its job),
`tags`, `item_tags`, `user_goals`, `study_sessions`, `daily_study`,
`flashcard_decks`, `deck_items`, `progress_summary`, `review_logs`; the
columns `learning_items.metadata`, `user_settings.categories`,
`user_settings.sources`, `progress_summary.mastery`, `review_logs.deck_id`,
`session_id`, and the unread deck columns. None of these is read by the app
today.

**Review history is kept in full.** Every answer is one `reviews` row: item,
time, outcome, response time and the schedule snapshot (ease and interval
before, due date after). All existing `review_logs` rows are copied. That is
enough to show accuracy and speed over time, study days and streaks (grouped
by day, replacing `daily_study`), and how strongly each item is known over
time. `mastery` is dropped because it can be derived from the same data.

**Views (4 → 0):** `words`, `phrases`, `verb_tables`, `card_faces` all go. The
card back is built in TypeScript from the item's own columns, which also
removes the em dash placeholder. `has_answer` is the one rule the database
still needs to know (to fill a deck server-side); it uses only immutable
expressions, and a test keeps it in step with the TypeScript card back.

### Functions (10 → 7), all `security invoker`, `search_path = ''`

Execute is granted to `authenticated` only, and revoked from everyone on the
two trigger functions.

| Function | Replaces | Notes |
| --- | --- | --- |
| `set_updated_at()` | client timestamps | **before update only** (so the backfill keeps copied timestamps), on `items` and `user_settings` |
| `items_guard()` | nothing (new) | before update: raises if `id`, `user_id` or `item_type` is `distinct from` the old value; quietly puts back `created_at`. Never depends on `auth.uid()`, so the `set null` cascade from `sources` passes through it. An upsert that sends unchanged values passes. |
| `save_items(items jsonb)` | 3 instead-of triggers, `set_item_categories` | upserts N items and their collection tags in **one request and one transaction**. Raises if `auth.uid()` is null; sets `user_id` from `auth.uid()` and ignores any `user_id` or `has_answer` in the payload; resolves collection and source **names** to ids inside the call, creating missing ones, so a failure leaves nothing behind; deletes old links only for the ids it just wrote. A type change on an existing id aborts the batch, and the app says why. |
| `build_deck(types, only_needs_review, size, ...)` | `build_flashcard_deck` | reads `items` and `progress` directly. Prunes the caller's decks beyond the newest 10: filtered on `user_id = (select auth.uid())`, ordered `created_at desc, id desc`, never the deck it just made. No `deck_name`. |
| `record_review(item, answer, took_ms)` | `apply_review` | inserts into `reviews` (with the schedule snapshot) and upserts `progress`. **Invoker, not DEFINER**: the verdict is judged in the browser, so DEFINER never stopped self-promotion (audit L1). No `deck`, `session` or `local_day`. |
| `merge_tag(from, to)`, `merge_source(from, to)` | `rename_category`, `rename_source`, `sync_category_tags` | a plain rename is now a one-row `update`; a merge onto an existing name needs a function. Each raises unless both ids are visible to the caller and `from <> to`; `merge_tag` also requires both tags to share a context. It inserts the new links and deletes the old, skipping items that already carry the target. |

### Policies

Every table: RLS enabled in the migration that creates it, policies
`to authenticated` on `(select auth.uid()) = user_id`, **one per command**,
`with check` on insert and update. A command with no policy is also
**revoked**, so each is locked twice.

| Table | select | insert | update | delete | Revoked |
| --- | --- | --- | --- | --- | --- |
| user_settings | yes | yes | yes | no | delete |
| items, tags, sources | yes | yes | yes | yes | |
| item_tags | yes | yes | no | yes | update |
| decks, deck_cards | yes | yes | no | yes | update |
| progress | yes | yes | yes | no | delete |
| reviews | yes | yes | no | no | update, delete |

Everywhere: revoke `truncate, references, trigger` from `authenticated`.
Existing `user_settings` policies are dropped by name and recreated.

**Last statements of step 1:** `revoke all on all tables, sequences, functions
in schema public from anon`, plus `alter default privileges for role postgres
in schema public revoke all on tables / sequences / functions from anon`.
Nothing in `src/` queries while signed out (the public routes only call
`auth.*`), and Supabase Auth does not use these grants.

### Before and after

| | Now | After |
| --- | --- | --- |
| Tables | 15 | 9 |
| Views | 4 | 0 |
| Functions | 10 (1 DEFINER) | 7 (0 DEFINER) |
| Triggers | 3 instead-of | 3 (updated_at on 2 tables, guard on items) |
| Non-PK indexes | 22 | 12 |
| Duplicate permissive policies | 9 tables | 0 |

| Path | Now | After |
| --- | --- | --- |
| Load a list | 1 request per 1,000 rows; view with per-row `array_agg` and two `exists` checks | 1 request per 1,000 rows; `items` filtered by `item_type`, with embedded `item_tags(tag_id)` |
| Save one | 1 request, 3 to 4 statements via trigger | 1 `save_items` call |
| Save N | **N requests**, 3N to 4N statements | **1** `save_items` call |
| Import, Replace | delete all (cascades wipe progress), insert all | `save_items` for the file, then delete that list's ids the file lacks; **progress survives** |
| Build deck | 1 RPC over `card_faces` (3 LEFT JOINs, computed `back`) | 1 RPC over `items_user_answerable_idx` |
| Answer a card | 1 RPC, 5 tables written | 1 RPC, 2 tables written |

---

## 3. Migration plan

Three migrations in one maintenance window. Step 1 is **additive**: every new
object has a name the old schema does not use, so the old schema is untouched
until step 3 and rolling back step 1 means dropping what it made.

### Step 0: pre-flight (nothing changes)

1. **Back up**, to an absolute path outside the repository, for example
   `C:\Users\Liezl\Documents\db-backups\<date>\`:
   `npx supabase db dump --linked -f <dir>\schema.sql`,
   `npx supabase db dump --linked --data-only -f <dir>\data.sql`, and the
   app's own Backup export from the live site. Treat the data dump as
   sensitive (it can include `auth` tables) and delete it once the refactor
   has settled.
2. **Drift check:** `npx supabase db diff --linked`.
3. **Postgres version** 15 or later (`on delete set null (source_id)` needs it).
4. **Row counts** for every table, saved beside the dump.
5. **Integrity queries**, each must return zero rows:
   - cross-account links: `item_tags` to another account's tag, `deck_items`
     to another account's item;
   - detail rows: attached to an item of the wrong type; items with no detail
     row; null detail fields;
   - limits: items with more than 5 categories (collections), which cannot happen today since the app allows 3; `tenses` longer than 12;
     `rows` not an array or longer than 30;
   - names: blank titles; title duplicates ignoring case within a type;
     category (collection) or source names that are blank, padded, over 60 characters, or
     clash ignoring case.
6. **Rehearse locally (decided).** Docker is running on this machine: `npx supabase
   start`, load the dump, run steps 1 to 3 and the app against it. Make one
   step 1 assertion fail on purpose to confirm the CLI rolls the whole file
   back.

### Step 1: migration `refactor_build_new_schema` (additive)

Created with `npx supabase migration new refactor_build_new_schema`.

1. **Freeze the old schema:** revoke insert, update and delete on the old
   tables and views, and execute on the old write RPCs, from `authenticated`.
   The old app then fails loudly during the window instead of writing data
   that would not be copied. Then rename the old `tags` and `item_tags` to
   `legacy_tags` and `legacy_item_tags`, freeing the names for the new tables.
   The old views keep working, since a view follows a table through a rename.
2. Create the 9 tables, indexes, functions, policies and revokes.
3. Backfill as `postgres`, straight into base tables (RLS does not apply, so
   the constraints are the protection; child `user_id` always comes from the
   parent item):
   - `tags` (context `collection`) from `legacy_tags` union `user_settings.categories`;
   - `sources` from `user_settings.sources` union every distinct non-blank
     `learning_items.source`, so no source text is lost;
   - `items` from `learning_items` joined to its detail row, **same ids**,
     `source_id` resolved by name;
   - `item_tags` from `legacy_item_tags`, `position` numbered by name;
   - `progress`; `reviews` with `overriding system value`, then the identity
     reset; the newest 10 `decks` and their `deck_cards`.
4. **Assertions** that raise, rolling the whole migration back:
   - row counts per type match, and detail rows copied per type equal items
     of that type;
   - every old item id exists in `items`; every collection link and every
     non-blank source survived;
   - the step 0 integrity checks, repeated here;
   - `pg_policies` holds **exactly** the expected policies;
   - no `prosecdef` function in `public`; every `public` function has
     `search_path=''`;
   - `anon` holds no table, sequence or function privilege, and
     `pg_default_acl` grants it nothing.
5. The `anon` revokes run last.

A prepared `rollback_step1.sql` (kept outside `supabase/migrations/`) drops
the new objects, renames `legacy_tags` and `legacy_item_tags` back, and
re-grants what the freeze revoked.

### Step 2: the app change, pushed to `main` (Vercel deploys it)

| File | Change |
| --- | --- |
| `src/lib/remoteStore.ts` | read `items` filtered by `item_type`; write through `save_items`; delete with `.in(id)`. **Every list-wide delete filters on `item_type` as well as `user_id`**: against one table, `.eq("user_id")` alone would wipe the other two lists. Replace becomes save, then delete this list's ids the file lacks |
| `storage.ts`, `phraseStorage.ts`, `verbTables.ts` | `toRow`/`fromRow` map to `items` columns; collections and source by name; no client timestamps |
| `settings.ts` | collections (tags) and sources read and written as rows, and created, renamed and deleted by the user in Settings as today; a new account gets the default collections from `DEFAULT_COLLECTIONS` on first load (the names unchanged); `sync_category_tags` call removed |
| `renames.ts` | rename is an `update`; merge calls `merge_tag` / `merge_source` |
| `flashcards.ts` | count on `items` where `has_answer`; card back built in TS; `loadDeck` reads `deck_cards`, and a pruned deck loads as empty rather than an error; calls `build_deck` and `record_review` |
| `backup.ts` | new backups write `collections` instead of `categories`, and `BACKUP_VERSION` goes from 9 to 10. **`categories` must still read**, like `entries` and `term`, because every backup written so far uses it; a test fails if it is dropped |
| **Category becomes Collection, everywhere** | every label, heading, filter, settings list, import message and export column header that says Category or Categories says Collection or Collections. Identifiers follow: the domain field `categories` becomes `collections`, `categoryOptions.ts` becomes `collectionOptions.ts`, `MAX_CATEGORIES = 3` becomes `MAX_COLLECTIONS = 5`, `DEFAULT_CATEGORIES` becomes `DEFAULT_COLLECTIONS` with **the same names**, and so on (about 35 files in `src/`). Afterwards `grep -ri categor src` should find only the backup reader's old-spelling fallback and the comments that explain it |
| tests | update `remoteStore.write`, `renames`, `flashcards`, `loadDeck`, `applyImport`; add "Replace keeps progress", "Replace on one list leaves the others alone", "save_items is all-or-nothing" and "`has_answer` agrees with the card back". Each is broken on purpose once to prove it bites |
| `Docs/schema.md`, `CLAUDE.md` | rewritten for the new shape; the "no upsert against views" rule goes |

Checks before pushing: `npx tsc --noEmit`, `npx eslint src/`,
`npx vitest run`, `npm run build`. After deploy: sign in on production, load
each list, save, bulk-edit, import with Replace on each list, build a deck,
answer cards.

### Step 3: migration `refactor_drop_old_schema`

Only after step 2 is verified on production.

- Drop the 4 views, 3 instead-of triggers and their functions, the old
  functions by exact signature, the 14 old tables (including `legacy_tags` and
  `legacy_item_tags`), `user_settings.categories`
  and `.sources`.
- Assert each object is gone (a `drop if exists` that silently misses has
  happened here before) and repeat the policy, DEFINER, `search_path` and
  `anon` assertions.
- Rerun `npx supabase db advisors --linked`: expect no security warnings and
  no duplicate-policy warnings.

### Rollback

| Failure point | Action |
| --- | --- |
| Step 1 fails | nothing: the migration rolled itself back |
| After step 1, before step 2 | run `rollback_step1.sql` and record it as a **new forward migration**, so the history stays true and the next `db push` does not re-apply step 1 |
| Step 2 broken on production | revert the commit on `main`, then roll back step 1 as above |
| After step 3 | drop the new tables, load `schema.sql` then `data.sql`, repair the history for both migrations, revert the code. Anything written through the new app since step 2 is lost, so step 3 waits until production has been checked |

---

## 4. Security checklist (auditor's 12 requirements)

The auditor reviewed this design and found no path to another account's
rows. The composite foreign keys make it stronger than today's schema: a link
to another account's row fails whether that row exists or not.

| # | Requirement | Met by |
| --- | --- | --- |
| 1 | RLS in the creating migration, asserted | step 1 assertions, exact policy set |
| 2 | `user_id` on every owned row, composite FKs | `item_tags` (both sides), `deck_cards`, `progress`, `reviews`, `items.source_id` |
| 3 | One policy per command | policy table |
| 4 | Commands without a policy locked twice | revoked column of the policy table |
| 5 | Ownership and type columns immutable | `items_guard()`; type pinned by checks in the single table |
| 6 | Views `security_invoker` | no views remain |
| 7 | At most one hardened DEFINER | none remain |
| 8 | Revoke `anon` defaults on tables and sequences | end of step 1, asserted |
| 9 | `search_path = ''`, execute revoked from public and anon | every function, asserted |
| 10 | Verify data before copying; assert drops | step 0 queries repeated as step 1 assertions; step 3 assertions |
| 11 | Policy columns lead an index | `user_id` leads every owner-filtered index, including `reviews` |
| 12 | No secret key | nothing introduced |

Dashboard jobs, not migrations: turn on leaked password protection; check
whether "automatically expose new tables" is on; rerun Advisors after steps 1
and 3.

---

## 5. Risks, and what breaks first as the app grows

- **The single `items` table widens with each new type.** Three types and five
  fields is comfortably within reason. Around five or six types, or a type
  with many fields, detail tables become worth it again.
- **Live push.** The local rehearsal (step 0.6) makes it a repeat, not a first
  attempt.
- **Clients can write their own `progress` and `reviews` directly**, not only
  through `record_review`. Accepted: it is their own data, and the browser
  already decides the verdict. Nothing should treat `reviews` as a tamper-proof
  record of what was answered.
- **Deck pruning** keeps the newest 10 decks. A deck open in an old tab for
  days could vanish mid-play; it loads as empty.
- **Deleting a source** leaves its items with no source (`set null`), where
  today they keep the orphaned text.

**Not changing:** item ids; old backup files still import; `remoteStore` as the only
list data path; `settings.ts` staying separate; RLS on `(select auth.uid())`.

---

## 6. Open questions (defaults assumed above)

1. Rename `learning_items` to `items`? *Default: yes.*
2. ~~Deleting a source in use: clear it on the items, or refuse?~~ **Decided: refuse,** for sources and collections alike.
3. Keep the newest 10 decks? *Default: yes.*
4. ~~Drop the schedule-history columns from `review_logs`?~~ **Decided: keep them**, for a history-of-improvement view.
5. ~~Rehearse locally before the live push?~~ **Decided: yes.**
6. ~~Keep the limit of 3 collections per item?~~ **Decided: raise it to 5.**
7. ~~Rename existing collections?~~ **Decided: no.** Collection names are the user's own, created and edited in Settings; existing ones and the default list stay exactly as they are. Only the word Category changes.
