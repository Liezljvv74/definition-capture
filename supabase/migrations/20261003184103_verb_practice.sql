-- Verb practice: every tense of every verb has its own review schedule, and a
-- verb counts as learned only when all its tenses are. See Docs/verb-practice.md.

-- 1. The scheduling rules, shared by record_review and record_tense_review so
-- the two can never drift apart. Unchanged from record_review: the interval
-- is capped at ten years because numeric(6,2) overflows on about the ninth
-- correct answer in a row.
create function public.schedule_step(
  streak integer,
  interval_days numeric,
  ease numeric,
  lapses integer,
  answer text,
  out next_streak integer,
  out next_interval numeric,
  out next_ease numeric,
  out next_lapses integer
)
language plpgsql immutable set search_path = '' as $$
begin
  next_ease := ease;
  next_lapses := lapses;
  if answer = 'correct' then
    next_streak := streak + 1;
    next_interval := case
      when streak = 0 then 1
      when streak = 1 then 6
      else least(3650, greatest(1, round(interval_days * ease)))
    end;
    next_ease := least(3.00, ease + 0.10);
  elsif answer = 'skipped' then
    next_streak := streak;
    next_interval := 0;
  else
    next_streak := 0;
    next_lapses := lapses + 1;
    next_interval := 0;
    next_ease := greatest(1.30, ease - 0.20);
  end if;
end;
$$;

create or replace function public.record_review(
  target_item uuid,
  answer text,
  took_ms integer default null
) returns public.progress
language plpgsql security invoker set search_path = '' as $$
declare
  owner uuid := auth.uid();
  prior public.progress;
  step record;
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

  select * into step
  from public.schedule_step(prior.streak, prior.interval_days, prior.ease, prior.lapses, answer);

  insert into public.reviews
    (user_id, item_id, outcome, response_ms, prior_interval_days, prior_ease, next_due_at)
  values
    (owner, target_item, answer, took_ms, prior.interval_days, prior.ease,
     now() + make_interval(days => step.next_interval::integer));

  insert into public.progress as p
    (item_id, user_id, times_seen, times_correct, streak, lapses, ease,
     interval_days, due_at, last_reviewed_at)
  values
    (target_item, owner, 1, case when answer = 'correct' then 1 else 0 end,
     step.next_streak, step.next_lapses, step.next_ease, step.next_interval,
     now() + make_interval(days => step.next_interval::integer), now())
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

-- 2. One schedule per (verb, tense). A tense is identified by its name on the
-- table. The composite key makes a row belong to its owner's verb, and deleting
-- the verb deletes its rows.
create table public.verb_tense_progress (
  item_id uuid not null,
  user_id uuid not null,
  tense text not null check (btrim(tense) <> '' and char_length(tense) <= 100),
  times_seen integer not null default 0 check (times_seen >= 0),
  times_correct integer not null default 0
    check (times_correct >= 0 and times_correct <= times_seen),
  streak integer not null default 0 check (streak >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  ease numeric(4, 2) not null default 2.50 check (ease >= 1.30),
  interval_days numeric(6, 2) not null default 0 check (interval_days >= 0),
  due_at timestamptz,
  last_reviewed_at timestamptz,
  primary key (item_id, tense),
  foreign key (item_id, user_id) references public.items (id, user_id) on delete cascade
);
create index verb_tense_progress_user_due_idx on public.verb_tense_progress (user_id, due_at);

alter table public.verb_tense_progress enable row level security;

-- Written by record_tense_review as the caller, the way progress is written by
-- record_review, so the caller needs the same insert and update rights.
create policy "Owners read their verb tense progress" on public.verb_tense_progress
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners add verb tense progress" on public.verb_tense_progress
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners change their verb tense progress" on public.verb_tense_progress
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- The same rights as progress: read, add and change, nothing else.
revoke all on public.verb_tense_progress from anon, authenticated;
grant select, insert, update on public.verb_tense_progress to authenticated;

-- 3. The history says which tense an answer was for; null for everything else.
alter table public.reviews
  add column tense text check (tense is null or char_length(tense) <= 100);

-- 4. Records one tense's result and moves its schedule.
create function public.record_tense_review(
  target_item uuid,
  target_tense text,
  answer text,
  took_ms integer default null
) returns public.verb_tense_progress
language plpgsql security invoker set search_path = '' as $$
declare
  owner uuid := auth.uid();
  prior public.verb_tense_progress;
  step record;
  result public.verb_tense_progress;
begin
  if owner is null then
    raise exception 'not signed in';
  end if;
  if answer is null or answer not in ('correct', 'again', 'revealed', 'skipped') then
    raise exception 'unknown answer %', answer;
  end if;
  if target_tense is null or btrim(target_tense) = '' then
    raise exception 'no tense';
  end if;
  if not exists (
    select 1 from public.items
    where id = target_item and user_id = owner and item_type = 'verb_table'
  ) then
    raise exception 'not your verb table';
  end if;
  -- Only a tense the table has, so no record is made that nothing would count.
  if not exists (
    select 1 from public.items where id = target_item and target_tense = any(tenses)
  ) then
    raise exception 'not a tense of this table';
  end if;

  select * into prior from public.verb_tense_progress
  where item_id = target_item and tense = target_tense;
  if not found then
    prior := row(target_item, owner, target_tense, 0, 0, 0, 0, 2.50, 0, null, null);
  end if;

  select * into step
  from public.schedule_step(prior.streak, prior.interval_days, prior.ease, prior.lapses, answer);

  insert into public.reviews
    (user_id, item_id, tense, outcome, response_ms, prior_interval_days, prior_ease, next_due_at)
  values
    (owner, target_item, target_tense, answer, took_ms, prior.interval_days, prior.ease,
     now() + make_interval(days => step.next_interval::integer));

  insert into public.verb_tense_progress as p
    (item_id, user_id, tense, times_seen, times_correct, streak, lapses, ease,
     interval_days, due_at, last_reviewed_at)
  values
    (target_item, owner, target_tense, 1, case when answer = 'correct' then 1 else 0 end,
     step.next_streak, step.next_lapses, step.next_ease, step.next_interval,
     now() + make_interval(days => step.next_interval::integer), now())
  on conflict (item_id, tense) do update set
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

-- 5. The dashboard. Its return type changes, so it is dropped and made again.
-- Flashcard counts (due, new, learning, learned, next due) are words and
-- phrases only; verbs are counted by their tenses.
drop function public.home_summary();

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
  remember_id uuid,
  verb_tenses_due integer,
  verb_tenses_new integer,
  verbs_new integer,
  verbs_learning integer,
  verbs_learned integer
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
           p.times_seen, p.times_correct, p.lapses,
           i.item_type in ('word', 'phrase') as card
    from public.items i
    left join public.progress p on p.item_id = i.id and p.user_id = owner
    where i.user_id = owner
  ),
  -- Each named tense of each verb table with at least one form filled in, each
  -- name once: an unnamed column is never practised, and two columns of the
  -- same name (which only an old backup could bring now) share one schedule.
  counted as (
    select distinct i.id as item_id, t.name as tense
    from public.items i
    cross join lateral unnest(i.tenses) with ordinality as t(name, ord)
    where i.user_id = owner and i.item_type = 'verb_table'
      and btrim(t.name) <> ''
      and exists (
        select 1 from jsonb_array_elements(coalesce(i.verb_rows, '[]'::jsonb)) r
        where btrim(coalesce(r -> 'conjugations' ->> (t.ord::integer - 1), '')) <> ''
      )
  ),
  tense_state as (
    select c.item_id, v.item_id is not null as answered, v.streak, v.due_at
    from counted c
    left join public.verb_tense_progress v
      on v.item_id = c.item_id and v.tense = c.tense and v.user_id = owner
  ),
  verb_state as (
    select ts.item_id,
           bool_and(ts.answered and ts.streak >= 2) as done,
           bool_or(ts.answered) as started
    from tense_state ts
    group by ts.item_id
  )
  select
    (count(*) filter (where m.item_type = 'word'))::integer,
    (count(*) filter (where m.item_type = 'word' and not m.has_answer))::integer,
    (count(*) filter (where m.item_type = 'phrase'))::integer,
    (count(*) filter (where m.item_type = 'verb_table'))::integer,
    (count(*) filter (where m.item_type = 'grammar'))::integer,
    (count(*) filter (where m.card and m.has_answer and m.due_at <= now()))::integer,
    (count(*) filter (where m.card and m.has_answer and not m.answered))::integer,
    (count(*) filter (where m.card and m.has_answer and m.answered and m.streak < 2))::integer,
    (count(*) filter (where m.card and m.has_answer and m.answered and m.streak >= 2))::integer,
    min(m.due_at) filter (where m.card and m.has_answer and m.due_at > now()),
    max(m.updated_at),
    -- Unchanged: a difficult word or phrase for "Do you still remember this one?".
    (select r.id from mine r
     where r.item_type in ('word', 'phrase') and r.has_answer
       and char_length(regexp_replace(r.title, '[[:space:][:punct:]]', '', 'g')) > 4
       and (not r.answered or r.streak < 2 or r.lapses > 0
            or (r.times_seen > 0 and r.times_correct < 0.8 * r.times_seen))
     order by case when r.answered and r.times_seen > 0
                        and (r.lapses > 0 or r.times_correct < 0.8 * r.times_seen)
                   then 0 else 1 end,
              random()
     limit 1),
    (select count(*) from tense_state ts where ts.answered and ts.due_at <= now())::integer,
    (select count(*) from tense_state ts where not ts.answered)::integer,
    (select count(*) from verb_state vs where not vs.started)::integer,
    (select count(*) from verb_state vs where vs.started and not vs.done)::integer,
    (select count(*) from verb_state vs where vs.done)::integer
  from mine m;
end;
$$;

-- 6. Rights: signed-in callers only, as for every function here.
revoke all on function
  public.schedule_step(integer, numeric, numeric, integer, text),
  public.record_tense_review(uuid, text, text, integer),
  public.home_summary()
from public, anon, authenticated;
grant execute on function
  public.schedule_step(integer, numeric, numeric, integer, text),
  public.record_tense_review(uuid, text, text, integer),
  public.home_summary()
to authenticated;

-- Checked as the earlier migrations do: the function set, invoker rights with
-- an empty search path everywhere, and no access for anon.
do $$
declare
  actual text[];
begin
  select array_agg(p.proname::text order by p.proname) into actual
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public';
  if actual is distinct from array['build_deck', 'home_summary', 'items_guard',
                                   'record_review', 'record_tense_review', 'rename_item_source',
                                   'rename_tag', 'save_items', 'schedule_step', 'set_updated_at'] then
    raise exception 'public functions are not the expected set: %', actual;
  end if;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('home_summary', 'record_review', 'record_tense_review', 'schedule_step')
      and (p.prosecdef or p.proconfig is distinct from array['search_path=""'])
  ) then
    raise exception 'a verb practice function has the wrong security settings';
  end if;

  if has_function_privilege('anon', 'public.record_tense_review(uuid, text, text, integer)', 'execute')
     or has_function_privilege('anon', 'public.home_summary()', 'execute') then
    raise exception 'anon can call a verb practice function';
  end if;
end;
$$;
