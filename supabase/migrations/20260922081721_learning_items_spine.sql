-- The spine: one row in `learning_items` for every thing the reader learns.
--
-- Three independent tables became three independent everything: three ways to
-- search, three sets of categories, three timestamps with three different
-- names. Anything that wants to work across all of them, and a flashcard deck
-- is exactly that, had to union them together and paper over the differences.
-- This gives them one identity to share.
--
-- Class table inheritance, not single table inheritance: the shared columns
-- live here and each type keeps its own table for what only it has. The
-- alternative, one wide table with nullable columns per type, makes every
-- `not null` unenforceable the moment a second type exists.
--
-- **Ids are preserved.** Every row keeps the id it already had, because those
-- ids are in `?id=` links people have pasted elsewhere and in the backup files
-- on their disk. A backfill that minted new ones would quietly break both.
--
-- The three names the app already reads, `words`, `phrases` and `verb_tables`,
-- become views over the join, with `instead of` triggers so writes still work.
-- That is what keeps this migration from being an application rewrite: the app
-- carries on issuing exactly the same statements, and Postgres splits them
-- across the two tables inside the one transaction. PostgREST gives a request
-- one transaction and no more, so without the trigger an insert would be two
-- round trips with a window in between where a base row exists and its detail
-- does not.

/* ------------------------------------------------------------- item types */

-- A table rather than an enum. A new content type is then an insert, not a
-- migration that rewrites a type other tables depend on, which is the whole
-- point of asking for this to survive new pages.
create table public.item_types (
  key text primary key check (key ~ '^[a-z_]+$'),
  label text not null,
  label_plural text not null,
  -- Where the list lives, so a deck or a dashboard can link to an item
  -- without the app holding a hard-coded map from type to route.
  route text not null,
  -- Lower sorts first: the order these appear in pickers and summaries.
  position integer not null default 0
);

insert into public.item_types (key, label, label_plural, route, position) values
  ('word', 'Word', 'Words', '/word', 10),
  ('phrase', 'Phrase', 'Phrases', '/phrase', 20),
  ('verb_table', 'Verb table', 'Verb tables', '/verbs', 30);

-- Readable by anyone signed in, writable by nobody: it is reference data, and
-- a new type arrives by migration alongside the code that understands it.
alter table public.item_types enable row level security;

create policy "Anyone signed in reads the item types"
  on public.item_types for select to authenticated
  using (true);

/* --------------------------------------------------------- learning_items */

create table public.learning_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_type text not null references public.item_types (key),

  -- The name the item is known by: the word, the phrase, the verb. Every list
  -- already had one and every list already matched on it the same way, which
  -- is why `findByName` in the app could live in one place. Now the database
  -- agrees.
  title text not null check (length(trim(title)) > 0),

  -- Free text whose links are resolved when it is rendered. On the base
  -- because every type has always had one except verb tables, which only
  -- lacked one by omission.
  ref text not null default '',

  -- Where it came from. The reader's own list, held in `user_settings`, so no
  -- check constraint here: a value removed from that list must not make an
  -- existing row unsaveable.
  source text not null default 'Manual',

  -- Flagged by the reader as something to come back to. This is the filter
  -- the flashcard builder offers, and it is deliberately a plain flag rather
  -- than a score: a score is derived from review history and belongs in
  -- `progress_summary`, while this is an opinion the reader is entitled to
  -- hold regardless of what their history says.
  needs_review boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz,

  -- The escape hatch, and it is meant to stay small. Anything queried, sorted
  -- or filtered on belongs in a column where it can be constrained and
  -- indexed. This is for the per-type oddment that would otherwise force a
  -- migration for one field on one page.
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object')
);

-- One name per type per reader, which is the rule each table already enforced
-- for itself. Partial indexes rather than one index over the base, because a
-- word and a phrase are allowed to share a name: the app resolves that clash
-- in favour of the word, and a single unique index would reject data people
-- already have.
create unique index learning_items_user_word_key
  on public.learning_items (user_id, lower(title))
  where item_type = 'word';
create unique index learning_items_user_phrase_key
  on public.learning_items (user_id, lower(title))
  where item_type = 'phrase';
create unique index learning_items_user_verb_table_key
  on public.learning_items (user_id, lower(title))
  where item_type = 'verb_table';

-- The list read: one type, newest first. `id` breaks ties so paging cannot
-- drop or repeat a row across a boundary, the same reason the app's reader
-- adds it.
create index learning_items_user_type_created_idx
  on public.learning_items (user_id, item_type, created_at desc, id desc);

-- "Most recently added" across every type, which is one of the sources the
-- flashcard builder offers and the one that has no equivalent today.
create index learning_items_user_created_idx
  on public.learning_items (user_id, created_at desc, id desc);

-- Partial, because the rows that want reviewing are the small minority and an
-- index over all of them would be mostly dead weight.
create index learning_items_user_needs_review_idx
  on public.learning_items (user_id, item_type)
  where needs_review;

alter table public.learning_items enable row level security;

create policy "Users read their own items"
  on public.learning_items for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users create their own items"
  on public.learning_items for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update their own items"
  on public.learning_items for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete their own items"
  on public.learning_items for delete to authenticated
  using ((select auth.uid()) = user_id);

/* ---------------------------------------------------- the typed extensions */

-- Each keyed by the base row's id rather than carrying one of its own, so the
-- two cannot disagree about which item they describe and `on delete cascade`
-- makes deleting the base enough.
--
-- These have no `user_id` of their own. Ownership is the base row's, and
-- duplicating it would create a second answer to the same question. Their row
-- level security reaches through the key instead.

create table public.word_details (
  id uuid primary key references public.learning_items (id) on delete cascade,
  definition text not null default ''
);

create table public.phrase_details (
  id uuid primary key references public.learning_items (id) on delete cascade,
  literal_meaning text not null default '',
  usage_example text not null default ''
);

create table public.verb_table_details (
  id uuid primary key references public.learning_items (id) on delete cascade,
  -- One per column, in display order. `rows[i].conjugations[j]` belongs to
  -- `tenses[j]`, which is an invariant the application holds and the database
  -- cannot, so the app keeps padding rows to the headings when it reads them.
  tenses text[] not null default '{}',
  rows jsonb not null default '[]'::jsonb,
  constraint verb_table_details_rows_is_array check (jsonb_typeof(rows) = 'array'),
  constraint verb_table_details_rows_sane check (jsonb_array_length(rows) <= 30)
);

alter table public.word_details enable row level security;
alter table public.phrase_details enable row level security;
alter table public.verb_table_details enable row level security;

-- One policy shape, three times. `exists` against the base rather than a
-- duplicated `user_id`, so there is exactly one place that decides who owns a
-- row and the two can never drift.
create policy "Users read their own word details"
  on public.word_details for select to authenticated
  using (exists (
    select 1 from public.learning_items i
    where i.id = word_details.id and i.user_id = (select auth.uid())
  ));
create policy "Users write their own word details"
  on public.word_details for all to authenticated
  using (exists (
    select 1 from public.learning_items i
    where i.id = word_details.id and i.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.learning_items i
    where i.id = word_details.id and i.user_id = (select auth.uid())
  ));

create policy "Users read their own phrase details"
  on public.phrase_details for select to authenticated
  using (exists (
    select 1 from public.learning_items i
    where i.id = phrase_details.id and i.user_id = (select auth.uid())
  ));
create policy "Users write their own phrase details"
  on public.phrase_details for all to authenticated
  using (exists (
    select 1 from public.learning_items i
    where i.id = phrase_details.id and i.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.learning_items i
    where i.id = phrase_details.id and i.user_id = (select auth.uid())
  ));

create policy "Users read their own verb table details"
  on public.verb_table_details for select to authenticated
  using (exists (
    select 1 from public.learning_items i
    where i.id = verb_table_details.id and i.user_id = (select auth.uid())
  ));
create policy "Users write their own verb table details"
  on public.verb_table_details for all to authenticated
  using (exists (
    select 1 from public.learning_items i
    where i.id = verb_table_details.id and i.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.learning_items i
    where i.id = verb_table_details.id and i.user_id = (select auth.uid())
  ));

/* ------------------------------------------------------------- the backfill */

-- Ids, timestamps and every value are carried across as they stand. The old
-- tables are renamed rather than dropped at the end of this file, so if
-- anything here is wrong the data is still sitting there under a new name.

insert into public.learning_items
  (id, user_id, item_type, title, ref, source, created_at, updated_at)
select id, user_id, 'word', word, ref, source, date_added, date_updated
from public.words;

insert into public.word_details (id, definition)
select id, definition from public.words;

insert into public.learning_items
  (id, user_id, item_type, title, ref, source, created_at, updated_at)
select id, user_id, 'phrase', phrase, ref, source, created_at, null
from public.phrases;

insert into public.phrase_details (id, literal_meaning, usage_example)
select id, literal_meaning, usage_example from public.phrases;

insert into public.learning_items
  (id, user_id, item_type, title, ref, source, created_at, updated_at)
select id, user_id, 'verb_table', verb, '', 'Manual', created_at, updated_at
from public.verb_tables;

insert into public.verb_table_details (id, tenses, rows)
select id, tenses, rows from public.verb_tables;

-- The categories arrays are left on the old tables for now. The next
-- migration turns them into tag rows, and reading them from one place is
-- simpler than reading them from two.
alter table public.words rename to words_legacy;
alter table public.phrases rename to phrases_legacy;
alter table public.verb_tables rename to verb_tables_legacy;

/* ------------------------------------------------------------------- views */

-- The names the application already reads and writes, reproducing the exact
-- column list each table had. Nothing in `src/` changes because of this file.
--
-- `security_invoker` so the reader's own row level security applies to the
-- underlying tables. Without it a view runs as its owner and hands every
-- account's rows to everyone, which is the single most expensive mistake
-- available in this file.

create view public.words with (security_invoker = true) as
  select
    i.id,
    i.user_id,
    i.title as word,
    d.definition,
    i.ref,
    i.source,
    i.created_at as date_added,
    i.updated_at as date_updated,
    '{}'::text[] as categories
  from public.learning_items i
  join public.word_details d on d.id = i.id
  where i.item_type = 'word';

create view public.phrases with (security_invoker = true) as
  select
    i.id,
    i.user_id,
    i.title as phrase,
    d.literal_meaning,
    d.usage_example,
    i.ref,
    i.source,
    i.created_at,
    '{}'::text[] as categories
  from public.learning_items i
  join public.phrase_details d on d.id = i.id
  where i.item_type = 'phrase';

create view public.verb_tables with (security_invoker = true) as
  select
    i.id,
    i.user_id,
    i.title as verb,
    d.tenses,
    d.rows,
    i.created_at,
    i.updated_at
  from public.learning_items i
  join public.verb_table_details d on d.id = i.id
  where i.item_type = 'verb_table';

/* --------------------------------------------------- writing through them */

-- `instead of` rather than leaving Postgres to work it out: an automatically
-- updatable view has to touch exactly one table, and every one of these
-- touches two.
--
-- Each function runs inside the transaction of the statement that fired it, so
-- the base row and its detail arrive together or not at all.

create or replace function public.words_write() returns trigger
language plpgsql security invoker as $$
begin
  if tg_op = 'INSERT' then
    insert into public.learning_items
      (id, user_id, item_type, title, ref, source, created_at, updated_at)
    values (
      coalesce(new.id, gen_random_uuid()),
      new.user_id, 'word', new.word,
      coalesce(new.ref, ''), coalesce(new.source, 'Manual'),
      coalesce(new.date_added, now()), new.date_updated
    )
    returning id into new.id;

    insert into public.word_details (id, definition)
    values (new.id, coalesce(new.definition, ''));
    return new;

  elsif tg_op = 'UPDATE' then
    update public.learning_items set
      title = new.word,
      ref = coalesce(new.ref, ''),
      source = coalesce(new.source, 'Manual'),
      updated_at = new.date_updated
    where id = old.id;

    update public.word_details set definition = coalesce(new.definition, '')
    where id = old.id;
    return new;

  else
    -- The detail row goes with it through `on delete cascade`.
    delete from public.learning_items where id = old.id;
    return old;
  end if;
end;
$$;

create trigger words_write_trigger
  instead of insert or update or delete on public.words
  for each row execute function public.words_write();

create or replace function public.phrases_write() returns trigger
language plpgsql security invoker as $$
begin
  if tg_op = 'INSERT' then
    insert into public.learning_items
      (id, user_id, item_type, title, ref, source, created_at)
    values (
      coalesce(new.id, gen_random_uuid()),
      new.user_id, 'phrase', new.phrase,
      coalesce(new.ref, ''), coalesce(new.source, 'Manual'),
      coalesce(new.created_at, now())
    )
    returning id into new.id;

    insert into public.phrase_details (id, literal_meaning, usage_example)
    values (new.id, coalesce(new.literal_meaning, ''), coalesce(new.usage_example, ''));
    return new;

  elsif tg_op = 'UPDATE' then
    update public.learning_items set
      title = new.phrase,
      ref = coalesce(new.ref, ''),
      source = coalesce(new.source, 'Manual'),
      updated_at = now()
    where id = old.id;

    update public.phrase_details set
      literal_meaning = coalesce(new.literal_meaning, ''),
      usage_example = coalesce(new.usage_example, '')
    where id = old.id;
    return new;

  else
    delete from public.learning_items where id = old.id;
    return old;
  end if;
end;
$$;

create trigger phrases_write_trigger
  instead of insert or update or delete on public.phrases
  for each row execute function public.phrases_write();

create or replace function public.verb_tables_write() returns trigger
language plpgsql security invoker as $$
begin
  if tg_op = 'INSERT' then
    insert into public.learning_items
      (id, user_id, item_type, title, source, created_at, updated_at)
    values (
      coalesce(new.id, gen_random_uuid()),
      new.user_id, 'verb_table', new.verb, 'Manual',
      coalesce(new.created_at, now()), new.updated_at
    )
    returning id into new.id;

    insert into public.verb_table_details (id, tenses, rows)
    values (new.id, coalesce(new.tenses, '{}'), coalesce(new.rows, '[]'::jsonb));
    return new;

  elsif tg_op = 'UPDATE' then
    update public.learning_items set
      title = new.verb,
      updated_at = coalesce(new.updated_at, now())
    where id = old.id;

    update public.verb_table_details set
      tenses = coalesce(new.tenses, '{}'),
      rows = coalesce(new.rows, '[]'::jsonb)
    where id = old.id;
    return new;

  else
    delete from public.learning_items where id = old.id;
    return old;
  end if;
end;
$$;

create trigger verb_tables_write_trigger
  instead of insert or update or delete on public.verb_tables
  for each row execute function public.verb_tables_write();

comment on table public.learning_items is
  'One row per thing the reader learns. Typed detail hangs off it by id.';
comment on view public.words is
  'Compatibility view: the shape the app read before learning_items existed.';
