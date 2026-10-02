-- The dashboard at /home, and the deck its Review now button plays.
--
-- One function rather than eight requests: every number on the dashboard is a
-- count over the same join of items and progress, and Postgres reads the
-- caller's rows once to produce all of them. Security invoker like every
-- other function here, so row level security applies as it does to the
-- caller's own queries; the explicit `user_id = owner` filters are the same
-- belt-and-braces `build_deck` wears.

create function public.home_summary()
returns table (
  words integer,
  words_without_definition integer,
  phrases integer,
  verb_tables integer,
  grammar_rules integer,
  due integer,
  new_items integer,
  learning integer,
  learned integer,
  next_due_at timestamptz,
  last_saved_at timestamptz,
  remember_id uuid
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  owner uuid := auth.uid();
begin
  if owner is null then
    raise exception 'not signed in';
  end if;

  return query
  with mine as (
    select i.id, i.item_type, i.has_answer, i.updated_at,
           p.item_id is not null as answered, p.streak, p.due_at
    from public.items i
    left join public.progress p on p.item_id = i.id and p.user_id = owner
    where i.user_id = owner
  )
  select
    (count(*) filter (where m.item_type = 'word'))::integer,
    (count(*) filter (where m.item_type = 'word' and not m.has_answer))::integer,
    (count(*) filter (where m.item_type = 'phrase'))::integer,
    (count(*) filter (where m.item_type = 'verb_table'))::integer,
    (count(*) filter (where m.item_type = 'grammar'))::integer,
    -- Only items that can still be answered: a word whose definition was
    -- cleared keeps its progress row but can no longer be played.
    (count(*) filter (where m.has_answer and m.due_at <= now()))::integer,
    (count(*) filter (where m.has_answer and not m.answered))::integer,
    -- Learned is two correct answers in a row, the mockup's "typed its
    -- meaning correctly on your last reviews". `streak` resets on a miss.
    (count(*) filter (where m.has_answer and m.answered and m.streak < 2))::integer,
    (count(*) filter (where m.has_answer and m.answered and m.streak >= 2))::integer,
    min(m.due_at) filter (where m.has_answer and m.due_at > now()),
    max(m.updated_at),
    -- Words and phrases only: a verb table's back is a whole conjugation,
    -- too big for a "do you still remember" card. `order by random()` reads
    -- every candidate, which is fine at one person's glossary size.
    (select r.id from mine r
     where r.has_answer and r.item_type in ('word', 'phrase')
     order by random() limit 1)
  from mine m;
end;
$$;

-- Postgres cannot add a parameter to a function in place, so build_deck is
-- dropped and recreated: the same body, plus `only_due`. It defaults to false,
-- so every existing caller builds exactly the deck it built before. When true
-- only items whose review date has come are drawn; the existing ordering by
-- `due_at` already puts the most overdue first.
drop function public.build_deck(text[], uuid[], boolean, boolean, integer);

create function public.build_deck(
  item_types text[] default '{}',
  tag_ids uuid[] default '{}',
  only_needs_review boolean default false,
  only_recent boolean default false,
  size integer default 50,
  only_due boolean default false
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
      and (not only_due or p.due_at <= now())
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

-- Signed-in callers only, as for every function the app calls. A new
-- function is executable by PUBLIC (which includes anon) until revoked.
revoke all on function
  public.home_summary(),
  public.build_deck(text[], uuid[], boolean, boolean, integer, boolean)
from public, anon, authenticated;
grant execute on function
  public.home_summary(),
  public.build_deck(text[], uuid[], boolean, boolean, integer, boolean)
to authenticated;

-- Checked rather than assumed, as the earlier migrations do: the exact set of
-- public functions, both new ones invoker-rights with an empty search path,
-- and neither reachable without a session.
do $$
declare
  actual text[];
begin
  select array_agg(p.proname::text order by p.proname) into actual
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public';
  if actual is distinct from array['build_deck', 'home_summary', 'items_guard',
                                   'record_review', 'rename_item_source', 'rename_tag',
                                   'save_items', 'set_updated_at'] then
    raise exception 'public functions are not the expected set: %', actual;
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('home_summary', 'build_deck')
      and (p.prosecdef or p.proconfig is distinct from array['search_path=""'])
  ) then
    raise exception 'a new function has the wrong security settings';
  end if;

  if has_function_privilege('anon', 'public.home_summary()', 'execute')
     or has_function_privilege('anon',
          'public.build_deck(text[], uuid[], boolean, boolean, integer, boolean)', 'execute') then
    raise exception 'anon can call a new function';
  end if;
end;
$$;
