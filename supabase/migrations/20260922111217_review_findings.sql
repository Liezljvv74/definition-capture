-- Six things a review of the flashcard branch turned up, none of them urgent
-- and all of them cheaper to fix now than to explain later.

/* ------------------------------------------------- 1. the delete cascade */

-- Every other child of `learning_items` can be found by the id it hangs off:
-- the three detail tables and `progress_summary` key on it, `item_tags` leads
-- with it, `review_logs` indexes it. `deck_items` was the exception, so the
-- cascade that runs when an item is deleted had to scan the whole table to
-- find the rows to remove, once per item. Deleting two hundred words from the
-- Vocabulary list is two hundred of those scans in one transaction, against a
-- table that only ever grows, since nothing in the app deletes a deck.
create index if not exists deck_items_item_idx on public.deck_items (item_id);

-- The index beside it was declared `where answered_at is null`, for "the next
-- unanswered card in this deck", which turned out to be a query the review
-- screen does not run: it reads the whole deck once, in order, and answers
-- each card by primary key. A partial index no query can use is write cost
-- with nothing on the other side of the ledger, so it loses the condition and
-- becomes the ordering `loadDeck` actually asks for.
drop index if exists public.deck_items_deck_position_idx;
create index deck_items_deck_position_idx on public.deck_items (deck_id, position);

/* --------------------------------------- 2. the append-only claim, kept */

-- `review_logs` is the record everything else is derived from: the schedule in
-- `progress_summary` and the streak in `daily_study` can both be rebuilt from
-- it, which is why it has no update and no delete policy. It did have an
-- insert policy, and that quietly cost the same property: anything holding the
-- publishable key could append a row saying whatever it liked, so replaying
-- the log would no longer reproduce the summary.
--
-- Nothing needs the policy. Every write goes through `apply_review`, which is
-- `security definer` and therefore not subject to policies at all. Dropping it
-- makes the claim in the design true rather than merely intended.
drop policy if exists "Users add their own review logs" on public.review_logs;

/* ------------------------------------------- 3. tags of one kind at a time */

-- `tags.kind` exists so that a second vocabulary can be added later without a
-- second table. Two places had forgotten it, and both would have been data
-- loss on the day that happened rather than a wrong label: saving a word
-- through the form deletes all of its tags and writes back the categories it
-- was given, so a tag of another kind attached to that item would have gone;
-- and the compatibility views aggregate every tag into `categories`, so the
-- other kind's labels would have appeared in the category column and then been
-- saved back as categories.
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

  -- Categories only. Anything else attached to this item is somebody else's
  -- business and stays where it is.
  delete from public.item_tags it
  using public.tags t
  where it.item_id = target_item
    and t.id = it.tag_id
    and t.kind = 'category';

  insert into public.item_tags (item_id, tag_id)
  select target_item, t.id
  from unnest(clean) as n
  join public.tags t
    on t.user_id = owner and t.kind = 'category' and lower(t.name) = lower(n)
  on conflict do nothing;
end;
$$;

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
    coalesce(g.names, '{}'::text[]) as categories,
    i.needs_review
  from public.learning_items i
  join public.word_details d on d.id = i.id
  left join lateral (
    select array_agg(t.name order by t.name) as names
    from public.item_tags it
    join public.tags t on t.id = it.tag_id
    where it.item_id = i.id and t.kind = 'category'
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
    coalesce(g.names, '{}'::text[]) as categories,
    i.needs_review
  from public.learning_items i
  join public.phrase_details d on d.id = i.id
  left join lateral (
    select array_agg(t.name order by t.name) as names
    from public.item_tags it
    join public.tags t on t.id = it.tag_id
    where it.item_id = i.id and t.kind = 'category'
  ) g on true
  where i.item_type = 'phrase';

/* ------------------------------ 4. one category vocabulary, not two again */

-- The whole point of the tags migration was that categories had been three
-- lists that could disagree. It left two: `user_settings.categories`, which
-- Settings writes and the forms offer, and `tags`, which the flashcard filter
-- reads and only a row save maintains. So a category typed into Settings was
-- invisible to the filter until something was filed under it, and one deleted
-- there stayed in the filter for good.
--
-- This function is the join between them, called when Settings saves. A name
-- in the list gets a tag, in the order the reader put them in, because that
-- order is deliberate and the filter should show it. A tag no longer in the
-- list is deleted only if nothing is filed under it: the Settings page
-- promises that removing a category "leaves it on anything already filed under
-- it", and a category still in use has to keep working wherever it appears.
create or replace function public.sync_category_tags(names text[])
returns void
language plpgsql security invoker as $$
declare
  owner uuid := auth.uid();
  clean text[] := coalesce(names, '{}');
begin
  if owner is null then
    raise exception 'not signed in';
  end if;

  insert into public.tags (user_id, name, kind, position)
  select distinct on (lower(n.name))
    owner, n.name, 'category', n.at
  from unnest(clean) with ordinality as n(name, at)
  where length(trim(n.name)) > 0
  order by lower(n.name), n.at
  on conflict (user_id, kind, lower(name)) do update
    set position = excluded.position;

  delete from public.tags t
  where t.user_id = owner
    and t.kind = 'category'
    and lower(t.name) <> all (
      select lower(trim(n)) from unnest(clean) as n where length(trim(n)) > 0
    )
    and not exists (
      select 1 from public.item_tags it where it.tag_id = t.id
    );
end;
$$;

/* ----------------------------- 5. the deck builder, and the index for it */

-- Two things about the sort. The first is that the "most recently added"
-- source could never use `learning_items_user_created_idx`, which exists for
-- exactly that query: both sort keys were wrapped in `case when only_recent`,
-- and a planner given an expression cannot match it to an index on a column.
-- Splitting the two paths lets the recent deck be an index scan that stops as
-- soon as it has enough rows, and leaves the due-date path unchanged.
--
-- The second is that `row_number() over ()` has no ordering of its own, so the
-- position each card is given depended on the order rows happened to come out
-- of the subquery. It holds in practice and it is the deck's whole point, so
-- it is now ordered explicitly by a key the subquery carries.
create or replace function public.build_flashcard_deck(
  sources text[] default '{}',
  category_ids uuid[] default '{}',
  only_needs_review boolean default false,
  only_recent boolean default false,
  size integer default 50,
  deck_name text default ''
) returns uuid
language plpgsql security invoker as $$
declare
  owner uuid := auth.uid();
  deck uuid;
  wanted integer := greatest(1, least(500, size));
begin
  if owner is null then
    raise exception 'not signed in';
  end if;

  insert into public.flashcard_decks
    (user_id, name, source_types, requested_size, filters)
  values (
    owner, deck_name, coalesce(sources, '{}'), wanted,
    jsonb_build_object(
      'category_ids', to_jsonb(coalesce(category_ids, '{}')),
      'needs_review', only_needs_review,
      'most_recent', only_recent
    )
  )
  returning id into deck;

  if only_recent then
    insert into public.deck_items (deck_id, item_id, position)
    select deck, candidate.id, row_number() over (order by candidate.created_at desc)
    from (
      select c.id, c.created_at
      from public.card_faces c
      where c.user_id = owner
        and coalesce(c.back, '') <> ''
        and (cardinality(coalesce(sources, '{}')) = 0 or c.item_type = any(sources))
        and (not only_needs_review or c.needs_review)
        and (
          cardinality(coalesce(category_ids, '{}')) = 0
          or exists (
            select 1 from public.item_tags it
            where it.item_id = c.id and it.tag_id = any(category_ids)
          )
        )
      order by c.created_at desc
      limit wanted
    ) as candidate;
  else
    insert into public.deck_items (deck_id, item_id, position)
    select deck, candidate.id, row_number() over (order by candidate.due_at, candidate.id)
    from (
      select
        c.id,
        coalesce(
          (select p.due_at from public.progress_summary p where p.item_id = c.id),
          'epoch'::timestamptz
        ) as due_at
      from public.card_faces c
      where c.user_id = owner
        and coalesce(c.back, '') <> ''
        and (cardinality(coalesce(sources, '{}')) = 0 or c.item_type = any(sources))
        and (not only_needs_review or c.needs_review)
        and (
          cardinality(coalesce(category_ids, '{}')) = 0
          or exists (
            select 1 from public.item_tags it
            where it.item_id = c.id and it.tag_id = any(category_ids)
          )
        )
      -- Due first, then at random, so a reader with nothing due still gets a
      -- different deck each time rather than the same alphabetical fifty.
      order by due_at asc, random()
      limit wanted
    ) as candidate;
  end if;

  return deck;
end;
$$;

/* ------------------------------------------ 6. the legacy tables, off the API */

-- `words_legacy`, `phrases_legacy` and `verb_tables_legacy` are the pre-spine
-- tables, kept so the backfill can be checked against what it was built from.
-- Keeping the data is worth it for now; keeping it reachable is a separate
-- decision that was never actually taken. They carry their original row level
-- security, so nothing leaks between accounts, but every account's glossary
-- exists twice over PostgREST and only one copy is maintained.
revoke all on public.words_legacy from anon, authenticated;
revoke all on public.phrases_legacy from anon, authenticated;
revoke all on public.verb_tables_legacy from anon, authenticated;
