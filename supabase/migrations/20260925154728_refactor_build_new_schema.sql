-- Step 1 of the database refactor in `Docs/db-refactor-plan.md`: build the
-- new schema beside the old one, copy every row across, and prove the copy.
--
-- Nothing old is dropped here. Every new table and function has a name the
-- old schema does not use, so until step 3 (`refactor_drop_old_schema`) the
-- old tables are still there and undoing this migration means dropping what
-- it made; `rollback_step1.sql`, kept beside the backups rather than in this
-- folder, does that.
--
-- The whole file runs in one transaction. Every check in section 7 raises on
-- failure, and a raise here rolls back every statement above it, so the
-- database is either fully migrated or exactly as it was.
--
-- What the new schema is, and why, is in the plan. In short: one `items`
-- table in place of `learning_items` and its three detail tables; generic
-- `tags` with a `context` (the app calls the one context in use today a
-- Collection); `sources` as rows items point at; and the flashcard tables cut
-- down to what something reads. Every owned row carries `user_id`, and a
-- composite foreign key proves it agrees with its parent.

/* ------------------------------------------- 1. freeze the old schema */

-- The app keeps running against the old schema until the new code is
-- deployed. Anything it wrote after the copy below would be lost without a
-- word, so its writes are refused instead: a failed save is visible, a lost
-- one is not. Reads keep working. `rollback_step1.sql` grants these back.
revoke insert, update, delete on
  public.learning_items, public.word_details, public.phrase_details,
  public.verb_table_details, public.tags, public.item_tags,
  public.review_logs, public.progress_summary, public.daily_study,
  public.study_sessions, public.user_goals, public.flashcard_decks,
  public.deck_items, public.words, public.phrases, public.verb_tables
from authenticated;

revoke execute on function
  public.apply_review(uuid, text, uuid, uuid, integer, date),
  public.build_flashcard_deck(text[], uuid[], boolean, boolean, integer, text),
  public.sync_category_tags(text[]),
  public.set_item_categories(uuid, uuid, text[]),
  public.rename_category(text, text),
  public.rename_source(text, text)
from authenticated;

-- The new tag tables take the old names, so the old ones step aside. A view
-- follows a table through a rename, so `words` and `phrases` keep reading.
-- Index names are unique across the schema, not per table, so the indexes
-- behind the old keys are renamed too.
alter table public.tags rename to legacy_tags;
alter table public.item_tags rename to legacy_item_tags;
alter index public.tags_pkey rename to legacy_tags_pkey;
alter index public.tags_user_kind_name_key rename to legacy_tags_user_kind_name_key;
alter index public.tags_user_kind_position_idx rename to legacy_tags_user_kind_position_idx;
alter index public.item_tags_pkey rename to legacy_item_tags_pkey;
alter index public.item_tags_tag_idx rename to legacy_item_tags_tag_idx;

/* --------------------------------------------------------- 2. tables */

-- One source per item, so a plain lookup table rather than a tag context.
-- `unique (id, user_id)` is what `items` points its composite key at.
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null
    check (name = btrim(name) and name <> '' and length(name) <= 60),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create unique index sources_user_name_key on public.sources (user_id, lower(name));

-- Generic tags. `context` says what a tag is for, and each context keeps its
-- own names: "Home" can exist once as a collection and once as something
-- else later. Adding a context is one change to this check, not a new table.
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  context text not null check (context in ('collection')),
  name text not null
    check (name = btrim(name) and name <> '' and length(name) <= 60),
  created_at timestamptz not null default now(),
  unique (id, context, user_id)
);
create unique index tags_user_context_name_key
  on public.tags (user_id, context, lower(name));

-- Every word, phrase and verb table, in one table. Three kinds of item with
-- five detail fields between them did not justify three detail tables, three
-- views and three triggers. The checks below keep each detail field on its
-- own type, which the detail tables used to do by existing or not.
--
-- `has_answer` is the one rule about card backs the database still needs,
-- to fill a deck without sending every item to the browser. It must agree
-- with the card back the app builds; a test in `src/` holds them together.
create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_type text not null check (item_type in ('word', 'phrase', 'verb_table')),
  title text not null check (btrim(title) <> ''),
  ref text not null default '',
  source_id uuid,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  definition text,
  literal_meaning text,
  usage_example text,
  tenses text[],
  verb_rows jsonb,
  has_answer boolean generated always as (
    case item_type
      when 'word' then coalesce(definition, '') <> ''
      when 'phrase' then coalesce(literal_meaning, '') <> ''
                      or coalesce(usage_example, '') <> ''
      when 'verb_table' then coalesce(jsonb_array_length(verb_rows), 0) > 0
      else false
    end
  ) stored,
  unique (id, user_id),
  -- A source that items still name cannot be deleted: Settings offers the bin
  -- only for one nothing uses, and renaming (which can merge two) is how one
  -- in use changes. The check is deferred to the end of the transaction. Each
  -- request from the app is its own transaction, so deleting a source in use
  -- is still refused; but deleting a whole account removes its items and its
  -- sources in one cascade, and an immediate check fires part way through
  -- that cascade, before the items have gone, and refuses it.
  foreign key (source_id, user_id) references public.sources (id, user_id)
    on delete no action deferrable initially deferred,
  constraint items_word_fields check (
    (item_type = 'word') = (definition is not null)),
  constraint items_phrase_fields check (
    (item_type = 'phrase') = (literal_meaning is not null and usage_example is not null)),
  constraint items_verb_fields check (
    (item_type = 'verb_table') = (tenses is not null and verb_rows is not null)),
  constraint items_tenses_limit check (
    tenses is null or cardinality(tenses) <= 12),
  constraint items_verb_rows_limit check (
    verb_rows is null
    or (jsonb_typeof(verb_rows) = 'array' and jsonb_array_length(verb_rows) <= 30)),
  -- A verb table has no source. Settings counts a source's uses from words
  -- and phrases only, so a source on a verb table would look unused there
  -- while the database refused to delete it.
  constraint items_verb_no_source check (item_type <> 'verb_table' or source_id is null)
);

-- One index for the title rule, where there used to be one per type.
create unique index items_user_type_title_key
  on public.items (user_id, item_type, lower(title));
-- A list page loads one type, newest first.
create index items_user_type_created_idx
  on public.items (user_id, item_type, created_at desc, id desc);
-- Building a deck only ever looks at items that have an answer.
create index items_user_answerable_idx
  on public.items (user_id, item_type) where has_answer;
-- Serves the check when a source is deleted.
create index items_source_idx on public.items (source_id, user_id);

-- Which item carries which tag. `context` is copied from the tag and held to
-- it by the foreign key, which is what lets a per-context rule live in a
-- check instead of a trigger: at most five collections per item. `position`
-- keeps the order the tags were given in.
--
-- A tag still on an item cannot be deleted, for the reason a source in use
-- cannot, and deferred for the same reason; see `items`.
create table public.item_tags (
  item_id uuid not null,
  tag_id uuid not null,
  user_id uuid not null,
  context text not null,
  position smallint not null check (position >= 1),
  constraint item_tags_collection_limit check (context <> 'collection' or position <= 5),
  primary key (item_id, tag_id),
  unique (item_id, context, position),
  foreign key (item_id, user_id) references public.items (id, user_id)
    on delete cascade,
  foreign key (tag_id, context, user_id) references public.tags (id, context, user_id)
    on delete no action on update cascade deferrable initially deferred
);
create index item_tags_by_tag_idx on public.item_tags (tag_id, context, user_id);

-- A deck is asked for once, played and finished with. It keeps nothing but
-- its owner and its order; `build_deck` keeps the newest ten.
create table public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);
create index decks_user_created_idx on public.decks (user_id, created_at desc, id desc);

create table public.deck_cards (
  deck_id uuid not null,
  position integer not null check (position >= 1),
  item_id uuid not null,
  user_id uuid not null,
  primary key (deck_id, position),
  unique (deck_id, item_id),
  foreign key (deck_id, user_id) references public.decks (id, user_id)
    on delete cascade,
  foreign key (item_id, user_id) references public.items (id, user_id)
    on delete cascade
);
-- Serves the cascade when an item is deleted.
create index deck_cards_item_idx on public.deck_cards (item_id, user_id);

-- Where each item stands in the review schedule. Was `progress_summary`;
-- `mastery` is gone because it can be read off `streak` and `interval_days`.
create table public.progress (
  item_id uuid primary key,
  user_id uuid not null,
  times_seen integer not null default 0 check (times_seen >= 0),
  times_correct integer not null default 0
    check (times_correct >= 0 and times_correct <= times_seen),
  streak integer not null default 0 check (streak >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  ease numeric(4, 2) not null default 2.50 check (ease >= 1.30),
  interval_days numeric(6, 2) not null default 0 check (interval_days >= 0),
  due_at timestamptz,
  last_reviewed_at timestamptz,
  foreign key (item_id, user_id) references public.items (id, user_id)
    on delete cascade
);

-- Every answer ever given, kept whole so a history of improvement can be
-- drawn from it: accuracy and speed over time, study days, and how strongly
-- each item is known (the schedule before and after). Was `review_logs`.
create table public.reviews (
  id bigint generated always as identity primary key,
  item_id uuid not null,
  user_id uuid not null,
  reviewed_at timestamptz not null default now(),
  outcome text not null check (outcome in ('correct', 'again', 'revealed', 'skipped')),
  response_ms integer check (response_ms is null or response_ms >= 0),
  prior_interval_days numeric(6, 2),
  prior_ease numeric(4, 2),
  next_due_at timestamptz,
  foreign key (item_id, user_id) references public.items (id, user_id)
    on delete cascade
);
create index reviews_item_idx on public.reviews (item_id, user_id);
create index reviews_user_reviewed_idx on public.reviews (user_id, reviewed_at desc);

/* ------------------------------------------------------ 3. triggers */

-- Timestamps belong to the database, and they move on an edit and nothing
-- else. Before update only: the copy in section 6 inserts, and must keep the
-- timestamps it copies.
--
-- What is not an edit: flagging an item from a flashcard (`needs_review`),
-- merging two sources (`source_id`), and a restore that saves an item over
-- itself unchanged. So the row is compared without those columns, and
-- `updated_at` moves only if something else differs. A caller that sets
-- `updated_at` itself is taken at its word: the word form sends the time of
-- the edit, and a restore sends the date the backup recorded, which the old
-- design kept and this one must too.
create function public.set_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.updated_at is distinct from old.updated_at then
    return new;
  end if;
  if (to_jsonb(new) - array['updated_at', 'needs_review', 'source_id', 'has_answer'])
     is distinct from
     (to_jsonb(old) - array['updated_at', 'needs_review', 'source_id', 'has_answer']) then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- An item's identity, owner and type are fixed once it exists. An upsert
-- sends every column, changed or not, so only a real change is refused;
-- `created_at` is put back quietly rather than refused, since an import
-- sends the date it has. Nothing here depends on `auth.uid()`, so an
-- update made by a migration, with no session of its own, passes through.
create function public.items_guard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.item_type is distinct from old.item_type then
    raise exception 'an item keeps its id, owner and type'
      using errcode = 'check_violation';
  end if;
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger items_guard before update on public.items
  for each row execute function public.items_guard();
create trigger items_set_updated_at before update on public.items
  for each row execute function public.set_updated_at();
create trigger user_settings_set_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

/* ----------------------------------------------------- 4. functions */

-- Saves any number of items, their source and their collections, in one
-- request and one transaction, so a save is all or nothing. It replaces the
-- three view triggers and `set_item_categories`, which saved one row per
-- request and could leave categories half written.
--
-- `payload` is a JSON array of items. Each needs an `id` (the app makes its
-- ids, so links and backups keep them). `source` and `collections` are
-- names, resolved here and created if missing. A key that is absent leaves
-- that part of an existing item alone: `needs_review` because the flashcard
-- screen sets it while a list may hold a stale copy, and `source` and
-- `collections` because a verb table has neither.
--
-- `created_at` and `updated_at` are taken from the payload for a new item
-- only, so a restored backup keeps its dates; on an existing item the guard
-- keeps `created_at` and the trigger sets `updated_at`. A new item with no
-- `updated_at` gets its `created_at`, which the app reads as never edited.
--
-- `user_id` always comes from the session and never from the payload.
create function public.save_items(payload jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  owner uuid := auth.uid();
begin
  if owner is null then
    raise exception 'not signed in';
  end if;
  if jsonb_typeof(payload) is distinct from 'array' then
    raise exception 'save_items takes an array of items';
  end if;
  if exists (select 1 from jsonb_array_elements(payload) e where e ->> 'id' is null) then
    raise exception 'every item needs an id';
  end if;

  -- Sources named in the payload that the account does not have yet.
  insert into public.sources (user_id, name)
  select distinct on (lower(btrim(e ->> 'source'))) owner, btrim(e ->> 'source')
  from jsonb_array_elements(payload) e
  where btrim(coalesce(e ->> 'source', '')) <> '' and e ->> 'item_type' <> 'verb_table'
  order by lower(btrim(e ->> 'source'))
  on conflict (user_id, lower(name)) do nothing;

  -- Existing items first, then new ones. Two statements rather than one
  -- upsert, because an upsert cannot tell "no needs_review key" from
  -- "needs_review is false". The insert sees the table as it was before
  -- this statement, so an id updated just above is not inserted again, and
  -- an id that belongs to another account (hidden from the update by row
  -- level security) fails on the primary key rather than being overwritten.
  with s as (
    select * from jsonb_to_recordset(payload) as x(
      id uuid, item_type text, title text, ref text, source text,
      needs_review boolean, definition text, literal_meaning text,
      usage_example text, tenses text[], verb_rows jsonb, created_at timestamptz,
      updated_at timestamptz)
  ), shaped as (
    select
      s.id, s.item_type, btrim(coalesce(s.title, '')) as title,
      coalesce(s.ref, '') as ref, s.needs_review, s.created_at, s.updated_at,
      s.source is not null and s.item_type <> 'verb_table' as has_source,
      case when s.item_type <> 'verb_table' then (
        select src.id from public.sources src
        where src.user_id = owner and lower(src.name) = lower(btrim(s.source))) end as source_id,
      case when s.item_type = 'word' then coalesce(s.definition, '') end as definition,
      case when s.item_type = 'phrase' then coalesce(s.literal_meaning, '') end as literal_meaning,
      case when s.item_type = 'phrase' then coalesce(s.usage_example, '') end as usage_example,
      case when s.item_type = 'verb_table' then coalesce(s.tenses, '{}') end as tenses,
      case when s.item_type = 'verb_table' then coalesce(s.verb_rows, '[]') end as verb_rows
    from s
  ), updated as (
    update public.items i set
      item_type = sh.item_type,
      title = sh.title,
      ref = sh.ref,
      source_id = case when sh.has_source then sh.source_id else i.source_id end,
      needs_review = coalesce(sh.needs_review, i.needs_review),
      updated_at = coalesce(sh.updated_at, i.updated_at),
      definition = sh.definition,
      literal_meaning = sh.literal_meaning,
      usage_example = sh.usage_example,
      tenses = sh.tenses,
      verb_rows = sh.verb_rows
    from shaped sh
    where i.id = sh.id
    returning i.id
  )
  insert into public.items
    (id, user_id, item_type, title, ref, source_id, needs_review, created_at,
     updated_at, definition, literal_meaning, usage_example, tenses, verb_rows)
  select
    sh.id, owner, sh.item_type, sh.title, sh.ref, sh.source_id,
    coalesce(sh.needs_review, false), coalesce(sh.created_at, now()),
    coalesce(sh.updated_at, sh.created_at, now()),
    sh.definition, sh.literal_meaning, sh.usage_example, sh.tenses, sh.verb_rows
  from shaped sh
  where not exists (select 1 from updated u where u.id = sh.id);

  -- Collections, for the items that sent a `collections` array. The `case`
  -- inside each call, rather than a filter beside it, is what keeps a
  -- `collections` that is not an array from raising: a filter in the same
  -- `where` is not guaranteed to run first.
  insert into public.tags (user_id, context, name)
  select distinct on (lower(btrim(n))) owner, 'collection', btrim(n)
  from jsonb_array_elements(payload) e,
       jsonb_array_elements_text(
         case when jsonb_typeof(e -> 'collections') = 'array' then e -> 'collections' end) n
  where btrim(n) <> ''
  order by lower(btrim(n))
  on conflict (user_id, context, lower(name)) do nothing;

  delete from public.item_tags it
  using jsonb_array_elements(payload) e
  where jsonb_typeof(e -> 'collections') = 'array'
    and it.item_id = (e ->> 'id')::uuid
    and it.context = 'collection';

  insert into public.item_tags (item_id, tag_id, user_id, context, position)
  select item_id, tag_id, owner, 'collection',
         row_number() over (partition by item_id order by first_at)
  from (
    select (e ->> 'id')::uuid as item_id, t.id as tag_id, min(n.at) as first_at
    from jsonb_array_elements(payload) e,
         jsonb_array_elements_text(
           case when jsonb_typeof(e -> 'collections') = 'array' then e -> 'collections' end)
           with ordinality as n(name, at)
    join public.tags t
      on t.user_id = owner and t.context = 'collection'
     and lower(t.name) = lower(btrim(n.name))
    where jsonb_typeof(e -> 'collections') = 'array'
    group by 1, 2
  ) picked;
end;
$$;

-- Records one flashcard answer: the review, and the item's new place in the
-- schedule (SM-2, unchanged from `apply_review`). It is security invoker,
-- where `apply_review` was definer: the browser decides whether an answer was
-- right, so running with more rights than the caller never stopped anyone
-- awarding themselves progress, and it made the function a second gate that
-- had to be right on its own. `progress` and `reviews` are the caller's own
-- rows, under their own policies.
create function public.record_review(
  target_item uuid,
  answer text,
  took_ms integer default null
) returns public.progress
language plpgsql security invoker set search_path = '' as $$
declare
  owner uuid := auth.uid();
  prior public.progress;
  next_ease numeric(4, 2);
  next_interval numeric(6, 2);
  next_streak integer;
  next_lapses integer;
  result public.progress;
begin
  if owner is null then
    raise exception 'not signed in';
  end if;
  if answer is null or answer not in ('correct', 'again', 'revealed', 'skipped') then
    raise exception 'unknown answer %', answer;
  end if;
  if not exists (select 1 from public.items where id = target_item and user_id = owner) then
    raise exception 'not your item';
  end if;

  select * into prior from public.progress where item_id = target_item;
  if not found then
    prior := row(target_item, owner, 0, 0, 0, 0, 2.50, 0, null, null);
  end if;

  next_ease := prior.ease;
  next_lapses := prior.lapses;

  if answer = 'correct' then
    next_streak := prior.streak + 1;
    next_interval := case
      when prior.streak = 0 then 1
      when prior.streak = 1 then 6
      -- `interval_days` is numeric(6,2), so an uncapped run of correct
      -- answers overflows it on about the ninth (1, 6, 18, 54 ... 13122 days)
      -- and the item can then never be answered again. The cap is inside the
      -- expression because the overflow happens on assignment. Ten years is
      -- far enough.
      else least(3650, greatest(1, round(prior.interval_days * prior.ease)))
    end;
    next_ease := least(3.00, prior.ease + 0.10);
  elsif answer = 'skipped' then
    next_streak := prior.streak;
    next_interval := 0;
  else
    next_streak := 0;
    next_lapses := prior.lapses + 1;
    next_interval := 0;
    next_ease := greatest(1.30, prior.ease - 0.20);
  end if;

  insert into public.reviews
    (user_id, item_id, outcome, response_ms, prior_interval_days, prior_ease, next_due_at)
  values
    (owner, target_item, answer, took_ms, prior.interval_days, prior.ease,
     now() + make_interval(days => next_interval::integer));

  insert into public.progress as p
    (item_id, user_id, times_seen, times_correct, streak, lapses, ease,
     interval_days, due_at, last_reviewed_at)
  values
    (target_item, owner, 1, case when answer = 'correct' then 1 else 0 end,
     next_streak, next_lapses, next_ease, next_interval,
     now() + make_interval(days => next_interval::integer), now())
  on conflict (item_id) do update set
    times_seen = p.times_seen + 1,
    times_correct = p.times_correct + case when answer = 'correct' then 1 else 0 end,
    streak = excluded.streak,
    lapses = excluded.lapses,
    ease = excluded.ease,
    interval_days = excluded.interval_days,
    due_at = excluded.due_at,
    last_reviewed_at = excluded.last_reviewed_at
  returning * into result;

  return result;
end;
$$;

-- Builds a deck and hands back its id, in one round trip. The same two
-- orders as `build_flashcard_deck`: newest first, or due first and then at
-- random, so a reader with nothing due still gets a different deck each
-- time. It reads `items` directly, through `items_user_answerable_idx`,
-- where the old function went through a view that built every card back.
--
-- Decks are kept to the newest ten. The deck just made is always among them,
-- and a deck pruned while open in another tab loads as empty.
create function public.build_deck(
  item_types text[] default '{}',
  tag_ids uuid[] default '{}',
  only_needs_review boolean default false,
  only_recent boolean default false,
  size integer default 50
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  owner uuid := auth.uid();
  deck uuid;
  wanted integer := greatest(1, least(500, size));
begin
  if owner is null then
    raise exception 'not signed in';
  end if;

  insert into public.decks (user_id) values (owner) returning id into deck;

  insert into public.deck_cards (deck_id, position, item_id, user_id)
  select deck, row_number() over (order by c.rank_first, c.rank_second), c.id, owner
  from (
    select
      i.id,
      case when only_recent then -extract(epoch from i.created_at)
           else extract(epoch from coalesce(p.due_at, 'epoch'::timestamptz)) end as rank_first,
      case when only_recent then 0 else random() end as rank_second
    from public.items i
    left join public.progress p on p.item_id = i.id
    where i.user_id = owner
      and i.has_answer
      and (cardinality(coalesce(item_types, '{}')) = 0 or i.item_type = any (item_types))
      and (not only_needs_review or i.needs_review)
      and (
        cardinality(coalesce(tag_ids, '{}')) = 0
        or exists (
          select 1 from public.item_tags it
          where it.item_id = i.id and it.tag_id = any (tag_ids)
        )
      )
    order by 2, 3
    limit wanted
  ) c;

  delete from public.decks d
  where d.user_id = owner
    and d.id <> deck
    and d.id not in (
      select k.id from public.decks k
      where k.user_id = owner
      order by k.created_at desc, k.id desc
      limit 10
    );

  return deck;
end;
$$;

-- Renames a tag within its context, or merges it into a tag that already has
-- the new name: renaming "Meal" to "Food" when Food exists means everything
-- in either is in Food, once. A plain rename would be a one-row update from
-- the app; this exists for the merge, and takes names because that is what
-- the Settings screen holds.
create function public.rename_tag(tag_context text, from_name text, to_name text)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  owner uuid := auth.uid();
  wanted text := btrim(coalesce(to_name, ''));
  source_tag uuid;
  target_tag uuid;
  moved_items uuid[];
  moved_positions smallint[];
begin
  if owner is null then
    raise exception 'not signed in';
  end if;
  if wanted = '' then
    raise exception 'a tag needs a name';
  end if;

  select t.id into source_tag from public.tags t
  where t.user_id = owner and t.context = tag_context
    and lower(t.name) = lower(btrim(coalesce(from_name, '')));
  if source_tag is null then
    raise exception 'no such tag';
  end if;

  select t.id into target_tag from public.tags t
  where t.user_id = owner and t.context = tag_context
    and lower(t.name) = lower(wanted) and t.id <> source_tag;

  if target_tag is null then
    -- Also the path for a change of case alone, "food" to "Food".
    update public.tags set name = wanted where id = source_tag;
    return;
  end if;

  -- The old links come off first, remembering where each sat, and the target
  -- takes that same place on every item not already in it. Taking the next
  -- place instead would count the old link too, and an item already in five
  -- collections would be refused a sixth for the moment the two overlapped.
  with moved as (
    delete from public.item_tags where tag_id = source_tag
    returning item_id, position
  )
  select array_agg(item_id), array_agg(position) into moved_items, moved_positions
  from moved;

  insert into public.item_tags (item_id, tag_id, user_id, context, position)
  select m.item_id, target_tag, owner, tag_context, m.position
  from unnest(moved_items, moved_positions) as m(item_id, position)
  where not exists (
    select 1 from public.item_tags o
    where o.item_id = m.item_id and o.tag_id = target_tag
  );

  delete from public.tags where id = source_tag;
end;
$$;

-- The same for a source. Items point at a source by id, so a plain rename is
-- one row; a merge moves the items across and deletes the old source.
create function public.rename_item_source(from_name text, to_name text)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  owner uuid := auth.uid();
  wanted text := btrim(coalesce(to_name, ''));
  source_row uuid;
  target_row uuid;
begin
  if owner is null then
    raise exception 'not signed in';
  end if;
  if wanted = '' then
    raise exception 'a source needs a name';
  end if;

  select s.id into source_row from public.sources s
  where s.user_id = owner and lower(s.name) = lower(btrim(coalesce(from_name, '')));
  if source_row is null then
    raise exception 'no such source';
  end if;

  select s.id into target_row from public.sources s
  where s.user_id = owner and lower(s.name) = lower(wanted) and s.id <> source_row;

  if target_row is null then
    update public.sources set name = wanted where id = source_row;
    return;
  end if;

  update public.items set source_id = target_row
  where user_id = owner and source_id = source_row;
  delete from public.sources where id = source_row;
end;
$$;

/* ------------------------------------------ 5. privileges and policies */

-- Every table: row level security on, one policy per command, and every
-- command without a policy also revoked, so it is locked twice. A missing
-- policy is easy to undo by accident; a revoked grant has to be restored on
-- purpose. `truncate`, `references` and `trigger` go too: the API cannot
-- issue them, and nothing else needs them.
alter table public.sources enable row level security;
alter table public.tags enable row level security;
alter table public.items enable row level security;
alter table public.item_tags enable row level security;
alter table public.decks enable row level security;
alter table public.deck_cards enable row level security;
alter table public.progress enable row level security;
alter table public.reviews enable row level security;

revoke all on public.sources, public.tags, public.items, public.item_tags,
  public.decks, public.deck_cards, public.progress, public.reviews,
  public.user_settings
from anon, authenticated;

grant select, insert, update, delete on public.sources, public.tags, public.items
  to authenticated;
grant select, insert, delete on public.item_tags, public.decks, public.deck_cards
  to authenticated;
grant select, insert, update on public.progress, public.user_settings to authenticated;
grant select, insert on public.reviews to authenticated;

create policy "Owners read their sources" on public.sources
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners add sources" on public.sources
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners change their sources" on public.sources
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners delete their sources" on public.sources
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Owners read their tags" on public.tags
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners add tags" on public.tags
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners change their tags" on public.tags
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners delete their tags" on public.tags
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Owners read their items" on public.items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners add items" on public.items
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners change their items" on public.items
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners delete their items" on public.items
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Links are replaced, never edited, so no update. The composite foreign keys
-- make both ends the caller's: a link row carries the caller's id, and each
-- key only matches a parent with that same id.
create policy "Owners read their item tags" on public.item_tags
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners add item tags" on public.item_tags
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners delete their item tags" on public.item_tags
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Owners read their decks" on public.decks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners add decks" on public.decks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners delete their decks" on public.decks
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Owners read their deck cards" on public.deck_cards
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners add deck cards" on public.deck_cards
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners delete their deck cards" on public.deck_cards
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Written by `record_review` as the caller. The caller could also write
-- these directly; that is accepted, since they are the caller's own rows and
-- the browser already decides the verdict. Nothing should treat `reviews` as
-- a tamper-proof record.
create policy "Owners read their progress" on public.progress
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners add progress" on public.progress
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners change their progress" on public.progress
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Append-only: no update or delete, by policy and by grant.
create policy "Owners read their reviews" on public.reviews
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners add reviews" on public.reviews
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- Functions: signed-in callers only. The trigger functions are called by
-- their triggers, which need no execute right, so nobody gets one.
revoke all on function
  public.set_updated_at(), public.items_guard(),
  public.save_items(jsonb),
  public.record_review(uuid, text, integer),
  public.build_deck(text[], uuid[], boolean, boolean, integer),
  public.rename_tag(text, text, text),
  public.rename_item_source(text, text)
from public, anon, authenticated;
grant execute on function
  public.save_items(jsonb),
  public.record_review(uuid, text, integer),
  public.build_deck(text[], uuid[], boolean, boolean, integer),
  public.rename_tag(text, text, text),
  public.rename_item_source(text, text)
to authenticated;

/* -------------------------------------------------------- 6. the copy */

-- As `postgres`, straight into the new tables. Row level security does not
-- apply to the table owner, so the constraints are the protection here. Every
-- child row takes `user_id` from its parent item (a deck card from its deck),
-- never from the tag or the old row, and the composite keys then refuse a
-- link to anything of another account's. The item-to-tag key is deferred, so
-- that refusal arrives at commit, after the checks in section 7, and still
-- rolls the whole file back.

-- Sources: the Settings list, plus every name an item carries, so no source
-- text is lost. Where the two spell a name differently, the Settings list
-- wins.
insert into public.sources (user_id, name)
select distinct on (user_id, lower(name)) user_id, name
from (
  select s.user_id, btrim(n) as name, 0 as preference
  from public.user_settings s, unnest(s.sources) n
  union all
  select i.user_id, btrim(i.source), 1
  from public.learning_items i
  where btrim(i.source) <> '' and i.item_type <> 'verb_table'
) named
where name <> ''
order by user_id, lower(name), preference;

-- Collections: the old category tags keep their ids, and a name on the
-- Settings list with no tag yet (the list and the tags were two copies that
-- could drift) becomes one.
insert into public.tags (id, user_id, context, name, created_at)
select id, user_id, 'collection', btrim(name), created_at
from public.legacy_tags
where kind = 'category';

insert into public.tags (user_id, context, name)
select distinct on (s.user_id, lower(btrim(n))) s.user_id, 'collection', btrim(n)
from public.user_settings s, unnest(s.categories) n
where btrim(n) <> ''
  and not exists (
    select 1 from public.tags t
    where t.user_id = s.user_id and t.context = 'collection'
      and lower(t.name) = lower(btrim(n))
  )
order by s.user_id, lower(btrim(n));

-- Items, with the same ids, so every link and every backup still points at
-- the right thing. A verb table gets no source: the old table gave every one
-- 'Manual' without asking and nothing ever showed it, and carrying it over
-- would make 'Manual' look in use to the database while Settings, which only
-- sees words and phrases, offered to remove it.
insert into public.items
  (id, user_id, item_type, title, ref, source_id, needs_review, created_at,
   updated_at, definition, literal_meaning, usage_example, tenses, verb_rows)
select
  i.id, i.user_id, i.item_type, i.title, i.ref,
  case when i.item_type <> 'verb_table' then (
    select src.id from public.sources src
    where src.user_id = i.user_id and lower(src.name) = lower(btrim(i.source))) end,
  i.needs_review, i.created_at, coalesce(i.updated_at, i.created_at),
  case when i.item_type = 'word' then coalesce(w.definition, '') end,
  case when i.item_type = 'phrase' then coalesce(p.literal_meaning, '') end,
  case when i.item_type = 'phrase' then coalesce(p.usage_example, '') end,
  case when i.item_type = 'verb_table' then coalesce(v.tenses, '{}') end,
  case when i.item_type = 'verb_table' then coalesce(v.rows, '[]') end
from public.learning_items i
left join public.word_details w on w.id = i.id and i.item_type = 'word'
left join public.phrase_details p on p.id = i.id and i.item_type = 'phrase'
left join public.verb_table_details v on v.id = i.id and i.item_type = 'verb_table';

-- Collection links, numbered by name since the old links kept no order.
insert into public.item_tags (item_id, tag_id, user_id, context, position)
select it.item_id, it.tag_id, i.user_id, 'collection',
       row_number() over (partition by it.item_id order by lower(t.name), t.id)
from public.legacy_item_tags it
join public.legacy_tags t on t.id = it.tag_id and t.kind = 'category'
join public.learning_items i on i.id = it.item_id;

insert into public.progress
  (item_id, user_id, times_seen, times_correct, streak, lapses, ease,
   interval_days, due_at, last_reviewed_at)
select p.item_id, i.user_id, p.times_seen, p.times_correct, p.streak, p.lapses,
       p.ease, p.interval_days, p.due_at, p.last_reviewed_at
from public.progress_summary p
join public.learning_items i on i.id = p.item_id;

-- Review ids are kept, and the identity then carries on after the highest.
insert into public.reviews
  (id, item_id, user_id, reviewed_at, outcome, response_ms,
   prior_interval_days, prior_ease, next_due_at)
overriding system value
select r.id, r.item_id, i.user_id, r.reviewed_at, r.outcome, r.response_ms,
       r.prior_interval_days, r.prior_ease, r.next_due_at
from public.review_logs r
join public.learning_items i on i.id = r.item_id;

select setval(
  pg_get_serial_sequence('public.reviews', 'id'),
  coalesce((select max(id) from public.reviews), 1),
  (select count(*) > 0 from public.reviews)
);

-- The newest ten decks per account, and their cards renumbered from one.
insert into public.decks (id, user_id, created_at)
select id, user_id, created_at
from (
  select d.*, row_number() over (partition by d.user_id order by d.created_at desc, d.id desc) as rn
  from public.flashcard_decks d
) ranked
where rn <= 10;

insert into public.deck_cards (deck_id, position, item_id, user_id)
select di.deck_id,
       row_number() over (partition by di.deck_id order by di.position, di.item_id),
       di.item_id, d.user_id
from public.deck_items di
join public.decks d on d.id = di.deck_id;

/* ----------------------------------------------------- 7. the proof */

-- Every check raises, and a raise rolls the whole file back. A copy that
-- silently drops rows is the failure this section exists for: the joins
-- above would do exactly that to a row that did not match.
do $$
declare
  missing integer;
begin
  -- Items: every id, per type.
  if (select count(*) from public.items) <> (select count(*) from public.learning_items) then
    raise exception 'items: % copied of %',
      (select count(*) from public.items), (select count(*) from public.learning_items);
  end if;
  select count(*) into missing from public.learning_items l
  where not exists (
    select 1 from public.items i
    where i.id = l.id and i.user_id = l.user_id and i.item_type = l.item_type
  );
  if missing > 0 then
    raise exception 'items: % old ids missing or changed', missing;
  end if;

  -- Detail rows: each one arrived on its own type. A word with no detail row
  -- would have been copied with an empty definition; this catches that.
  if (select count(*) from public.word_details) <> (select count(*) from public.items where item_type = 'word')
     or (select count(*) from public.phrase_details) <> (select count(*) from public.items where item_type = 'phrase')
     or (select count(*) from public.verb_table_details) <> (select count(*) from public.items where item_type = 'verb_table') then
    raise exception 'detail rows do not match items per type';
  end if;
  select count(*) into missing from public.word_details w
  join public.items i on i.id = w.id
  where i.definition is distinct from w.definition;
  if missing > 0 then raise exception 'word definitions: % differ', missing; end if;
  select count(*) into missing from public.phrase_details p
  join public.items i on i.id = p.id
  where i.literal_meaning is distinct from p.literal_meaning
     or i.usage_example is distinct from p.usage_example;
  if missing > 0 then raise exception 'phrase details: % differ', missing; end if;
  select count(*) into missing from public.verb_table_details v
  join public.items i on i.id = v.id
  where i.tenses is distinct from v.tenses or i.verb_rows is distinct from v.rows;
  if missing > 0 then raise exception 'verb tables: % differ', missing; end if;

  -- Sources: every word and phrase that named one still does, by the same
  -- name. Verb tables carry none; see the copy above.
  select count(*) into missing from public.learning_items l
  join public.items i on i.id = l.id
  left join public.sources s on s.id = i.source_id
  where btrim(l.source) <> '' and l.item_type <> 'verb_table'
    and (s.id is null or lower(s.name) <> lower(btrim(l.source)));
  if missing > 0 then raise exception 'sources: % items lost theirs', missing; end if;

  -- Collections: every name on a Settings list, and every old link.
  select count(*) into missing from public.user_settings s, unnest(s.categories) n
  where btrim(n) <> '' and not exists (
    select 1 from public.tags t
    where t.user_id = s.user_id and t.context = 'collection'
      and lower(t.name) = lower(btrim(n))
  );
  if missing > 0 then raise exception 'collections: % names missing', missing; end if;
  select count(*) into missing from public.legacy_item_tags l
  join public.legacy_tags t on t.id = l.tag_id and t.kind = 'category'
  where not exists (
    select 1 from public.item_tags it where it.item_id = l.item_id and it.tag_id = l.tag_id
  );
  if missing > 0 then raise exception 'collection links: % missing', missing; end if;

  -- The flashcard history, whole, and each row still its item owner's. The
  -- copy takes `user_id` from the item, so a mismatched old row would be
  -- handed to the item's owner without a word; the old write paths checked
  -- this, and here it is checked rather than assumed.
  if exists (select 1 from public.progress_summary p join public.learning_items i on i.id = p.item_id
             where p.user_id <> i.user_id)
     or exists (select 1 from public.review_logs r join public.learning_items i on i.id = r.item_id
                where r.user_id <> i.user_id) then
    raise exception 'old progress or reviews belong to someone other than the item''s owner';
  end if;
  if (select count(*) from public.progress) <> (select count(*) from public.progress_summary) then
    raise exception 'progress: row count differs';
  end if;
  if (select count(*) from public.reviews) <> (select count(*) from public.review_logs) then
    raise exception 'reviews: row count differs';
  end if;
  if (select count(*) from public.deck_cards) <> (
       select count(*) from public.deck_items di join public.decks d on d.id = di.deck_id) then
    raise exception 'deck cards: row count differs';
  end if;
end;
$$;

/* ---------------------------------------------------- 8. no anon at all */

-- Last, so nothing above can grant anything back. The app never queries
-- signed out (the public routes only call `auth.*`), and Supabase Auth does
-- not use these grants, so a table that somehow lacked row level security
-- would still be closed to anyone without a session.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
-- Postgres grants execute on a new function to PUBLIC, which includes anon,
-- and the three old view triggers still carry that grant. A trigger needs no
-- execute right to fire, and every function the app calls is granted to
-- authenticated by name, so PUBLIC loses it everywhere.
revoke all on all functions in schema public from public;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;

-- The security shape of the new tables, checked rather than assumed. The same
-- block ends `refactor_drop_old_schema`. This project has shipped a silent
-- no-op before (a policy dropped by a name it never had), so nothing here
-- settles for "at least one": the policies, what each one tests, the grants,
-- the functions and what anon can reach are each compared with an exact list.
do $$
declare
  owner_test constant text := '(( SELECT auth.uid() AS uid) = user_id)';
  new_tables constant text[] := array[
    'deck_cards', 'decks', 'item_tags', 'items', 'progress', 'reviews',
    'sources', 'tags', 'user_settings'
  ];
  expected_policies constant text[] := array[
    'deck_cards:DELETE', 'deck_cards:INSERT', 'deck_cards:SELECT',
    'decks:DELETE', 'decks:INSERT', 'decks:SELECT',
    'item_tags:DELETE', 'item_tags:INSERT', 'item_tags:SELECT',
    'items:DELETE', 'items:INSERT', 'items:SELECT', 'items:UPDATE',
    'progress:INSERT', 'progress:SELECT', 'progress:UPDATE',
    'reviews:INSERT', 'reviews:SELECT',
    'sources:DELETE', 'sources:INSERT', 'sources:SELECT', 'sources:UPDATE',
    'tags:DELETE', 'tags:INSERT', 'tags:SELECT', 'tags:UPDATE',
    'user_settings:INSERT', 'user_settings:SELECT', 'user_settings:UPDATE'
  ];
  -- What `authenticated` may do, table by table. A command with no policy is
  -- also absent here, which is the second lock.
  expected_grants constant text[] := array[
    'deck_cards:DELETE', 'deck_cards:INSERT', 'deck_cards:SELECT',
    'decks:DELETE', 'decks:INSERT', 'decks:SELECT',
    'item_tags:DELETE', 'item_tags:INSERT', 'item_tags:SELECT',
    'items:DELETE', 'items:INSERT', 'items:SELECT', 'items:UPDATE',
    'progress:INSERT', 'progress:SELECT', 'progress:UPDATE',
    'reviews:INSERT', 'reviews:SELECT',
    'sources:DELETE', 'sources:INSERT', 'sources:SELECT', 'sources:UPDATE',
    'tags:DELETE', 'tags:INSERT', 'tags:SELECT', 'tags:UPDATE',
    'user_settings:INSERT', 'user_settings:SELECT', 'user_settings:UPDATE'
  ];
  new_functions constant text[] := array[
    'build_deck', 'items_guard', 'record_review', 'rename_item_source',
    'rename_tag', 'save_items', 'set_updated_at'
  ];
  callable constant text[] := array[
    'build_deck', 'record_review', 'rename_item_source', 'rename_tag', 'save_items'
  ];
  actual text[];
  bad text;
begin
  -- Row level security on every table in public.
  select c.relname into bad from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity limit 1;
  if bad is not null then
    raise exception 'row level security is off on %', bad;
  end if;

  -- Exactly these policies on the new tables...
  select array_agg(tablename || ':' || cmd order by tablename || ':' || cmd) into actual
  from pg_policies where schemaname = 'public' and tablename = any (new_tables);
  if actual is distinct from expected_policies then
    raise exception 'policies are not the expected set: %', actual;
  end if;

  -- ...each permissive, for authenticated, and testing the owner and nothing
  -- else: `using` for the commands that read or remove a row, `with check`
  -- for the ones that write one, both for update.
  select tablename || ':' || cmd into bad from pg_policies
  where schemaname = 'public' and tablename = any (new_tables)
    and (
      permissive <> 'PERMISSIVE'
      or roles <> '{authenticated}'
      or (cmd in ('SELECT', 'DELETE') and (qual is distinct from owner_test or with_check is not null))
      or (cmd = 'INSERT' and (qual is not null or with_check is distinct from owner_test))
      or (cmd = 'UPDATE' and (qual is distinct from owner_test or with_check is distinct from owner_test))
    )
  limit 1;
  if bad is not null then
    raise exception 'policy % does not test the owner the way every policy must', bad;
  end if;

  -- Exactly these grants to authenticated.
  select array_agg(t || ':' || upper(priv) order by t || ':' || upper(priv)) into actual
  from unnest(new_tables) as t,
       unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) as priv
  where has_table_privilege('authenticated', format('public.%I', t), priv);
  if actual is distinct from expected_grants then
    raise exception 'grants to authenticated are not the expected set: %', actual;
  end if;

  -- The new functions: none definer, all with an empty path, and only the
  -- callable ones executable by a signed-in reader.
  select p.proname into bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any (new_functions)
    and (p.prosecdef or p.proconfig is distinct from array['search_path=""'])
  limit 1;
  if bad is not null then
    raise exception 'function % is definer or lacks an empty search_path', bad;
  end if;

  select array_agg(p.proname::text order by p.proname) into actual
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any (new_functions)
    and has_function_privilege('authenticated', p.oid, 'execute');
  if actual is distinct from callable then
    raise exception 'authenticated can execute the wrong functions: %', actual;
  end if;

  -- Nothing at all for anon: no table, column, sequence or function in public.
  select c.relname into bad from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and (
      (c.relkind in ('r', 'v', 'm', 'p')
       and (has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger')
            or has_any_column_privilege('anon', c.oid, 'select, insert, update, references')))
      or (c.relkind = 'S' and has_sequence_privilege('anon', c.oid, 'usage, select, update'))
    )
  limit 1;
  if bad is not null then
    raise exception 'anon has a privilege on %', bad;
  end if;

  select p.proname into bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
  limit 1;
  if bad is not null then
    raise exception 'anon can execute %', bad;
  end if;

  -- And nothing for anon, or for PUBLIC (which includes it), in the defaults
  -- that apply to what migrations create next: those `postgres` holds, in
  -- public or for every schema. Supabase keeps its own under
  -- `supabase_admin`, which a migration cannot change.
  if exists (
    select 1 from pg_default_acl d
    cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole::oid
      and (d.defaclnamespace = 0 or d.defaclnamespace = 'public'::regnamespace::oid)
      and a.grantee in ('anon'::regrole::oid, 0)
  ) then
    raise exception 'default privileges still grant anon or PUBLIC something';
  end if;
end;
$$;
