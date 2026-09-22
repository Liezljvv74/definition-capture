-- One labelling system for every content type, present and future.
--
-- Categories were three separate things that could disagree: a `text[]` on
-- `words`, another on `phrases`, and a curated list in `user_settings` that
-- the forms offered from. Verb tables had none at all. Renaming a category
-- reached none of the rows already filed under it, which the README described
-- as deliberate and which was really just what an array of loose strings
-- makes unavoidable.
--
-- `tags` with a `kind` rather than a `tags` table and a near-identical
-- `categories` table. They would have the same columns, the same policies and
-- the same join table; the only difference is what they are for, and that is
-- what a column is for. `kind` leaves room for a second vocabulary later
-- without another pair of tables.

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  -- 'category' is the curated list the forms offer. A free-form kind can be
  -- added here later without touching `item_tags` or anything reading it.
  kind text not null default 'category' check (kind in ('category')),
  -- Kept so Settings can show the list in the reader's own order, which it
  -- already does for sources and verb persons.
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- One spelling of a name per kind per reader, folded the way the app folds
-- every name it compares. A category typed as "food" once and "Food" later is
-- one category.
create unique index tags_user_kind_name_key
  on public.tags (user_id, kind, lower(name));

create index tags_user_kind_position_idx
  on public.tags (user_id, kind, position, name);

alter table public.tags enable row level security;

create policy "Users read their own tags"
  on public.tags for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users write their own tags"
  on public.tags for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

/* ---------------------------------------------------------------- item_tags */

-- The join, and the reason any of this works across content types: it points
-- at `learning_items`, so a tag applies to a word, a phrase, a verb table or
-- whatever is added next without this table changing.
create table public.item_tags (
  item_id uuid not null references public.learning_items (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (item_id, tag_id)
);

-- The primary key already serves "the tags on this item". This is the other
-- direction, which is the one the flashcard builder asks: every item in these
-- categories.
create index item_tags_tag_idx on public.item_tags (tag_id, item_id);

alter table public.item_tags enable row level security;

-- Ownership through the item, the same reasoning as the detail tables: one
-- place decides who owns a row.
create policy "Users read their own item tags"
  on public.item_tags for select to authenticated
  using (exists (
    select 1 from public.learning_items i
    where i.id = item_tags.item_id and i.user_id = (select auth.uid())
  ));
create policy "Users write their own item tags"
  on public.item_tags for all to authenticated
  using (exists (
    select 1 from public.learning_items i
    where i.id = item_tags.item_id and i.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.learning_items i
    where i.id = item_tags.item_id and i.user_id = (select auth.uid())
  ));

/* ------------------------------------------------------------- the backfill */

-- Every distinct category name anyone has used, from the rows and from the
-- curated list in Settings, becomes a tag. The curated list is included even
-- where nothing carries the name, because an empty category someone set up on
-- purpose is not the same as one nobody ever made.
insert into public.tags (user_id, name, kind, position)
select distinct on (user_id, lower(name)) user_id, name, 'category', 0
from (
  select user_id, unnest(categories) as name from public.words_legacy
  union all
  select user_id, unnest(categories) as name from public.phrases_legacy
  union all
  select user_id, unnest(categories) as name from public.user_settings
) as used
where length(trim(name)) > 0
order by user_id, lower(name), name;

-- Then the rows that carry them. `lower()` on both sides so a row filed under
-- "food" finds the tag saved as "Food".
insert into public.item_tags (item_id, tag_id)
select w.id, t.id
from public.words_legacy w
cross join lateral unnest(w.categories) as c(name)
join public.tags t
  on t.user_id = w.user_id and t.kind = 'category' and lower(t.name) = lower(c.name)
on conflict do nothing;

insert into public.item_tags (item_id, tag_id)
select p.id, t.id
from public.phrases_legacy p
cross join lateral unnest(p.categories) as c(name)
join public.tags t
  on t.user_id = p.user_id and t.kind = 'category' and lower(t.name) = lower(c.name)
on conflict do nothing;

/* ------------------------------------------------- the views, tags included */

-- The compatibility views gain their `categories` array back, aggregated from
-- the join so the application still sees the `text[]` it was written against.
--
-- This is the one place in the migration with a real cost: a lateral subquery
-- per row. At a few thousand rows it is nothing, and `item_tags_pkey` serves
-- it. It is also temporary. The point of these views is to let the app move
-- off them one page at a time rather than in one commit, and a page that has
-- moved reads `learning_items` and `item_tags` directly.

create or replace view public.words with (security_invoker = true) as
  select
    i.id,
    i.user_id,
    i.title as word,
    d.definition,
    i.ref,
    i.source,
    i.created_at as date_added,
    i.updated_at as date_updated,
    coalesce(g.names, '{}'::text[]) as categories
  from public.learning_items i
  join public.word_details d on d.id = i.id
  left join lateral (
    select array_agg(t.name order by t.name) as names
    from public.item_tags it
    join public.tags t on t.id = it.tag_id
    where it.item_id = i.id
  ) g on true
  where i.item_type = 'word';

create or replace view public.phrases with (security_invoker = true) as
  select
    i.id,
    i.user_id,
    i.title as phrase,
    d.literal_meaning,
    d.usage_example,
    i.ref,
    i.source,
    i.created_at,
    coalesce(g.names, '{}'::text[]) as categories
  from public.learning_items i
  join public.phrase_details d on d.id = i.id
  left join lateral (
    select array_agg(t.name order by t.name) as names
    from public.item_tags it
    join public.tags t on t.id = it.tag_id
    where it.item_id = i.id
  ) g on true
  where i.item_type = 'phrase';

/* ------------------------------------------- writing categories through them */

-- Replaces the whole set for an item, because that is what assigning a
-- `text[]` meant and the app still hands over a whole array. A name it has not
-- seen becomes a tag, so saving a row can introduce a category exactly as it
-- could when they were loose strings.
create or replace function public.set_item_categories(
  target_item uuid,
  owner uuid,
  names text[]
) returns void
language plpgsql security invoker as $$
declare
  clean text[] := coalesce(names, '{}');
begin
  insert into public.tags (user_id, name, kind)
  select distinct on (lower(n)) owner, n, 'category'
  from unnest(clean) as n
  where length(trim(n)) > 0
  order by lower(n), n
  on conflict (user_id, kind, lower(name)) do nothing;

  delete from public.item_tags where item_id = target_item;

  insert into public.item_tags (item_id, tag_id)
  select target_item, t.id
  from unnest(clean) as n
  join public.tags t
    on t.user_id = owner and t.kind = 'category' and lower(t.name) = lower(n)
  on conflict do nothing;
end;
$$;

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
    perform public.set_item_categories(new.id, new.user_id, new.categories);
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
    perform public.set_item_categories(old.id, old.user_id, new.categories);
    return new;

  else
    delete from public.learning_items where id = old.id;
    return old;
  end if;
end;
$$;

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
    perform public.set_item_categories(new.id, new.user_id, new.categories);
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
    perform public.set_item_categories(old.id, old.user_id, new.categories);
    return new;

  else
    delete from public.learning_items where id = old.id;
    return old;
  end if;
end;
$$;

comment on table public.tags is
  'One labelling vocabulary for every content type. `kind` says which.';
comment on table public.item_tags is
  'Points at learning_items, so a tag works on any type including future ones.';
