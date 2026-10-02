-- The "Do you still remember this one?" card now tests items that are actually
-- hard. Only `remember_id` changes: it is a word or phrase (never a verb table)
-- with an answer and more than four letters. It prefers items the learner has
-- missed or answered under 80% right, then items not yet learned, else null
-- and the card hides. A learned item is never drawn.

create or replace function public.home_summary()
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
    select i.id, i.item_type, i.title, i.has_answer, i.updated_at,
           p.item_id is not null as answered, p.streak, p.due_at,
           p.times_seen, p.times_correct, p.lapses
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
    -- Difficult words and phrases only, five letters or more (punctuation and spaces do
    -- not count). Tier 0 is an item answered before and missed since, or
    -- right less than 80% of the time; tier 1 is an item not yet learned;
    -- a learned item has no tier and is never drawn. The tier decides first
    -- and random() only breaks ties inside it, so a hard item always beats a
    -- new one. Accuracy is compared as correct < 0.8 * seen, not by dividing:
    -- Postgres does not guarantee that `seen > 0 and correct / seen` skips the
    -- division, and times_seen = 0 rows exist. Reads every candidate, fine at one person's glossary size.
    (select r.id from mine r
     where r.item_type in ('word', 'phrase') and r.has_answer
       and char_length(regexp_replace(r.title, '[[:space:][:punct:]]', '', 'g')) > 4
       and (not r.answered or r.streak < 2 or r.lapses > 0
            or (r.times_seen > 0 and r.times_correct < 0.8 * r.times_seen))
     order by case when r.answered and r.times_seen > 0
                        and (r.lapses > 0 or r.times_correct < 0.8 * r.times_seen)
                   then 0 else 1 end,
              random()
     limit 1)
  from mine m;
end;
$$;

-- Checked as the earlier migrations do: the function set is unchanged,
-- home_summary is still invoker-rights with an empty search path, and anon
-- cannot call it.
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
    where n.nspname = 'public' and p.proname = 'home_summary'
      and (p.prosecdef or p.proconfig is distinct from array['search_path=""'])
  ) then
    raise exception 'home_summary has the wrong security settings';
  end if;

  if has_function_privilege('anon', 'public.home_summary()', 'execute') then
    raise exception 'anon can call home_summary';
  end if;
end;
$$;
