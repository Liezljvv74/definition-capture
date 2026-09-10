-- Conjugation tables. One per verb, made from the Edit term screen and shown
-- on the Verbs page.
--
-- The rows live in a jsonb array rather than a second table. They are only
-- ever read, written, and displayed as one whole table — there is no query
-- that wants a single person's row across every verb — so a child table would
-- add a join to answer a question nobody asks. It also keeps the reader's own
-- row order without an `order` column to maintain.
--
-- A table is tied to its term by name, not by id, the same way `[[Name]]`
-- links resolve. Renaming a term therefore parts it from its table, which is
-- the same trade the rest of the app already makes.

create table public.verb_tables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  verb text not null check (length(trim(verb)) > 0),

  -- [{ "person": "ich", "conjugation": "arbeite", "notes": "" }, …]
  rows jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz,

  -- Rows are a list, and the app builds one row per configured person.
  constraint verb_tables_rows_is_array check (jsonb_typeof(rows) = 'array'),
  constraint verb_tables_rows_sane check (jsonb_array_length(rows) <= 30)
);

-- One table per verb, matched the way the term list matches its own names.
create unique index verb_tables_user_verb_key
  on public.verb_tables (user_id, lower(verb));

-- The Verbs page lists them newest first.
create index verb_tables_user_created_at_idx
  on public.verb_tables (user_id, created_at desc);

/* ------------------------------------------------------ row level security */

alter table public.verb_tables enable row level security;

create policy "Users read their own verb tables"
  on public.verb_tables for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create their own verb tables"
  on public.verb_tables for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own verb tables"
  on public.verb_tables for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own verb tables"
  on public.verb_tables for delete to authenticated
  using ((select auth.uid()) = user_id);

/* ---------------------------------------------------------------- persons */

-- The people a verb conjugates for — ich, du, er/sie/es, and so on. Asked
-- once, when the first table is made, and reused for every table after that.
-- Empty means "not asked yet", which is what triggers the prompt.
alter table public.user_settings
  add column verb_persons text[] not null default '{}',

  add constraint user_settings_verb_persons_sane
    check (coalesce(array_length(verb_persons, 1), 0) <= 30),

  add constraint user_settings_verb_persons_not_blank
    check (not ('' = any (verb_persons)));

comment on column public.user_settings.verb_persons is
  'The persons every conjugation table is built from. Empty until first asked.';
