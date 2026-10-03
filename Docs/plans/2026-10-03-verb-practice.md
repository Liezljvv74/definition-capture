# Verb Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A verb practice session on the Verbs page that asks blank conjugation tables for chosen tenses, schedules every tense of every verb on its own, and takes verbs out of flashcards.

**Architecture:** One migration adds `verb_tense_progress`, `reviews.tense`, a shared scheduling helper used by `record_review` and a new `record_tense_review`, and a new `home_summary`. A pure module (`src/lib/verbPractice.ts`) decides what to ask, marks answers and works out each tense's and verb's state; a thin data module reads tense records and writes results; the Verbs page gets a Practise dialog and tense marks, a new page runs the session, and flashcards and the dashboard drop verbs from their counts.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Supabase (Postgres, RLS, plpgsql), Vitest 3 (node environment).

**Spec:** `Docs/verb-practice.md`

## Global Constraints

- Work on branch `verb-practice`; every commit message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The migration is created with `npx supabase migration new verb_practice` and applied locally with `npx supabase migration up`. `npx supabase db push` to the live project happens only after the owner says yes, before the branch reaches `main`.
- No function is `security definer`; every function has `set search_path = ''`. Every new table has RLS enabled and policies on `(select auth.uid()) = user_id`, with `with check` on insert and update, in the same migration.
- Marking: `normaliseAnswer` on both sides (case and punctuation ignored), the account's answer separators offer alternatives, accents must match, no typo forgiveness.
- A tense counts on a verb only if at least one row has a non-empty form in that column ("counted tenses"). A tense is identified by its name.
- A tense is learned at streak >= 2. A verb is learned when every counted tense is learned, learning when any counted tense has a record, new otherwise; a verb with no counted tense is ignored.
- Red only for errors; tense marks use ink: ✓ learned, … learning, ✗ missed, ○ not tried.
- No em dashes anywhere. No note data in `localStorage` or `sessionStorage`. No new dependencies.
- Tab moves across and wraps to the next row (DOM order); Enter moves down a column (the global `EnterMovesDown` already does this for inputs).
- Checks before each commit: `npx tsc --noEmit`, `npx eslint src/ e2e/`, `npx vitest run`.
- Never stop processes you did not start; stop only your own dev server by the PID on port 3000 whose command line contains `Sprint2_Project_Captured`.

## Review Focus

1. A tense added to a table after a verb was learned makes the verb not learned and offers that tense as new. (Task 2 test "a newly added tense makes a learned verb learning again"; Task 1 rehearsal checks `verbs_learned` drops.)
2. A column whose forms are all empty never blocks "learned" and is never asked. (Task 2 tests on `countedTenses` and `practiceVerb`.)
3. `record_review` behaves exactly as before after moving its arithmetic into `schedule_step`. (Task 1 rehearsal replays the interval sequence 1, 6, 15 and the cap.)
4. Another account cannot read or write `verb_tense_progress` rows, and `record_tense_review` refuses an item that is not the caller's verb table. (Task 1 rehearsal.)
5. Recording results mid-session does not change the verbs being asked in that session, although the records the plan was built from change. (Task 5: the plan is frozen in state on first render; checked in the browser pass.)

## Departures from the spec, decided here

- The function's tense argument is `target_tense`, not `tense`: inside plpgsql a parameter named like the table's `tense` column makes every query on that table ambiguous.
- `verb_tense_progress` gets insert and update policies as well as select. The spec said writes go only through the function, but the function runs with the caller's rights (no function here is `security definer`), so the caller needs them, exactly as `progress` has them for `record_review`.
- `record_tense_review` also refuses a tense the table does not have, and `home_summary` counts a repeated tense name once (both from the database review on 3 October 2026). An unnamed tense ('') stays allowed, because tables made before tenses were asked for have one.
- `home_summary` also returns `verbs_new`, `verbs_learning` and `verbs_learned`, so "Learn new items" keeps counting words and phrases only while Your progress still counts verbs by their tenses.

---

### Task 1: The migration

**Files:**
- Create: `supabase/migrations/<timestamp>_verb_practice.sql` (via the CLI)
- Create: `supabase/tests/verb_practice.sql`
- Modify: `Docs/schema.md`

**Interfaces:**
- Produces (SQL): table `public.verb_tense_progress(item_id, user_id, tense, times_seen, times_correct, streak, lapses, ease, interval_days, due_at, last_reviewed_at)`; column `public.reviews.tense`; `public.schedule_step(...)`; `public.record_tense_review(target_item uuid, target_tense text, answer text, took_ms integer default null) returns public.verb_tense_progress`; `public.home_summary()` returning the old columns plus `verb_tenses_due, verb_tenses_new, verbs_new, verbs_learning, verbs_learned integer`, where `due`, `new_items`, `learning`, `learned`, `next_due_at` now count words and phrases only.

- [ ] **Step 1: Create the migration**

Run: `npx supabase migration new verb_practice` and write into the file:

```sql
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
  tense text not null check (char_length(tense) <= 100),
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
  if target_tense is null then
    raise exception 'no tense';
  end if;
  if not exists (
    select 1 from public.items
    where id = target_item and user_id = owner and item_type = 'verb_table'
  ) then
    raise exception 'not your verb table';
  end if;
  -- Only a tense the table has, so no record is made that nothing would count.
  -- An unnamed tense ('') is allowed: tables made before tenses were asked for
  -- have one.
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
  -- Each tense of each verb table with at least one form filled in, each name
  -- once: a table can hold two columns of the same name, and they share one
  -- schedule.
  counted as (
    select distinct i.id as item_id, t.name as tense
    from public.items i
    cross join lateral unnest(i.tenses) with ordinality as t(name, ord)
    where i.user_id = owner and i.item_type = 'verb_table'
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
```

- [ ] **Step 2: Write the rehearsal**

Create `supabase/tests/verb_practice.sql`, in the shape of `supabase/tests/home_summary.sql` (one transaction, rolled back, each `do` block raising on a wrong answer):

```sql
-- Rehearses verb practice against the local copy: the shared schedule,
-- record_tense_review, its refusals, RLS, and home_summary's verb counts.
-- One transaction, rolled back; each `do` block raises on a wrong answer.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'v1@example.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'v2@example.test');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';

-- A verb with two filled tenses and one empty column, and a word.
insert into public.items (id, user_id, item_type, title, tenses, verb_rows) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'verb_table', 'gehen',
   array['Präsens', 'Perfekt', 'Futur'],
   '[{"person":"ich","conjugations":["gehe","bin gegangen",""],"notes":""},
     {"person":"du","conjugations":["gehst","",""],"notes":""}]'::jsonb);
insert into public.items (id, user_id, item_type, title, definition) values
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1', 'word', 'Hund', 'dog');

do $$
declare s record;
begin
  select * into s from public.home_summary();
  -- Futur has no forms, so two tenses count; the verb is new.
  if s.verb_tenses_new <> 2 or s.verb_tenses_due <> 0 or s.verbs_new <> 1
     or s.verbs_learning <> 0 or s.verbs_learned <> 0 or s.new_items <> 1 then
    raise exception 'fresh verb counts are wrong: %', s;
  end if;
end $$;

-- record_review behaves as before: 1, 6, then interval * ease, capped.
do $$
declare r public.progress;
begin
  r := public.record_review('20000000-0000-0000-0000-000000000002', 'correct');
  if r.interval_days <> 1 or r.streak <> 1 then raise exception 'first correct: %', r; end if;
  r := public.record_review('20000000-0000-0000-0000-000000000002', 'correct');
  if r.interval_days <> 6 or r.streak <> 2 then raise exception 'second correct: %', r; end if;
  r := public.record_review('20000000-0000-0000-0000-000000000002', 'correct');
  if r.interval_days <> 16 or r.ease <> 2.80 then raise exception 'third correct: %', r; end if;
  r := public.record_review('20000000-0000-0000-0000-000000000002', 'again');
  if r.interval_days <> 0 or r.streak <> 0 or r.lapses <> 1 or r.ease <> 2.60 then
    raise exception 'a miss: %', r;
  end if;
end $$;

-- Präsens right twice (learned), Perfekt missed: the verb is learning.
do $$
declare v public.verb_tense_progress; s record;
begin
  v := public.record_tense_review('20000000-0000-0000-0000-000000000001', 'Präsens', 'correct');
  v := public.record_tense_review('20000000-0000-0000-0000-000000000001', 'Präsens', 'correct');
  if v.streak <> 2 or v.interval_days <> 6 then raise exception 'Präsens: %', v; end if;
  v := public.record_tense_review('20000000-0000-0000-0000-000000000001', 'Perfekt', 'again');
  if v.streak <> 0 or v.lapses <> 1 then raise exception 'Perfekt: %', v; end if;
  if (select count(*) from public.reviews where tense = 'Präsens') <> 2 then
    raise exception 'reviews do not carry the tense';
  end if;
  select * into s from public.home_summary();
  if s.verbs_learning <> 1 or s.verbs_learned <> 0 or s.verb_tenses_due <> 1 or s.verb_tenses_new <> 0 then
    raise exception 'learning verb counts are wrong: %', s;
  end if;
end $$;

-- Perfekt right twice: the verb is learned. Then Futur gets a form: the verb
-- is learning again and Futur is new.
do $$
declare s record;
begin
  perform public.record_tense_review('20000000-0000-0000-0000-000000000001', 'Perfekt', 'correct');
  perform public.record_tense_review('20000000-0000-0000-0000-000000000001', 'Perfekt', 'correct');
  select * into s from public.home_summary();
  if s.verbs_learned <> 1 or s.verbs_learning <> 0 then raise exception 'not learned: %', s; end if;

  update public.items
  set verb_rows = '[{"person":"ich","conjugations":["gehe","bin gegangen","werde gehen"],"notes":""},
                    {"person":"du","conjugations":["gehst","",""],"notes":""}]'::jsonb
  where id = '20000000-0000-0000-0000-000000000001';
  select * into s from public.home_summary();
  if s.verbs_learned <> 0 or s.verbs_learning <> 1 or s.verb_tenses_new <> 1 then
    raise exception 'a new tense did not reopen the verb: %', s;
  end if;
end $$;

-- Refusals: an unknown answer, a word instead of a verb table.
do $$
begin
  begin
    perform public.record_tense_review('20000000-0000-0000-0000-000000000001', 'Präsens', 'maybe');
    raise exception 'an unknown answer was accepted';
  exception when raise_exception then
    if sqlerrm not like 'unknown answer%' then raise; end if;
  end;
  begin
    perform public.record_tense_review('20000000-0000-0000-0000-000000000002', 'Präsens', 'correct');
    raise exception 'a word was accepted as a verb table';
  exception when raise_exception then
    if sqlerrm <> 'not your verb table' then raise; end if;
  end;
  begin
    perform public.record_tense_review('20000000-0000-0000-0000-000000000001', 'Plusquamperfekt', 'correct');
    raise exception 'a tense the table lacks was accepted';
  exception when raise_exception then
    if sqlerrm <> 'not a tense of this table' then raise; end if;
  end;
end $$;

-- Two columns of the same name count once.
do $$
declare s record;
begin
  -- Futur is not tried yet, so a double count would show as two new tenses.
  update public.items
  set tenses = array['Präsens', 'Perfekt', 'Futur', 'Futur'],
      verb_rows = '[{"person":"ich","conjugations":["gehe","bin gegangen","werde gehen","werde gehen"],"notes":""}]'::jsonb
  where id = '20000000-0000-0000-0000-000000000001';
  select * into s from public.home_summary();
  if s.verb_tenses_new <> 1 then
    raise exception 'a repeated tense was counted twice: %', s;
  end if;
end $$;

-- Another account sees none of it and cannot record against it.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
do $$
begin
  if exists (select 1 from public.verb_tense_progress) then
    raise exception 'another account can read verb tense progress';
  end if;
  begin
    perform public.record_tense_review('20000000-0000-0000-0000-000000000001', 'Präsens', 'correct');
    raise exception 'another account recorded a tense';
  exception when raise_exception then
    if sqlerrm <> 'not your verb table' then raise; end if;
  end;
end $$;

rollback;
```

Note: the third correct answer gives `round(6 * 2.70) = 16` (ease after two corrects is 2.70); if the existing rehearsal or a run shows a different value, compute it from the rules above and correct the expectation, not the function.

- [ ] **Step 3: Apply locally and rehearse**

Run: `npx supabase start` (if needed), `npx supabase migration up`, then
`docker exec -i supabase_db_Sprint2_Project_Captured psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/verb_practice.sql` and the existing `supabase/tests/home_summary.sql` the same way.
Expected: both end with `ROLLBACK` and raise nothing. Break `bool_and(ts.answered and ts.streak >= 2)` to `bool_or(...)` once, confirm the rehearsal raises, restore it.

- [ ] **Step 4: Document**

In `Docs/schema.md`: add `verb_tense_progress` to the table list (now twelve tables) with a section like `progress`'s; add `reviews.tense`; add `schedule_step` and `record_tense_review` to the functions table (now ten functions); note `home_summary`'s new columns and that its flashcard counts are words and phrases only, and that anything reading `reviews` for flashcard statistics must filter `tense is null`, since verb tense answers are reviews too. Update CLAUDE.md's "Eleven tables ... eight functions" sentence to twelve and ten, and name `verb_tense_progress` beside `progress` and `reviews`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests/verb_practice.sql Docs/schema.md CLAUDE.md
git commit -m "Give every verb tense its own review schedule" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: What to ask, and how it is marked

**Files:**
- Create: `src/lib/verbPractice.ts`, `src/lib/verbPractice.test.ts`

**Interfaces:**
- Consumes: `VerbTable`, `VerbRow` from `src/lib/types.ts`; `normaliseAnswer` from `src/lib/judgeAnswer.ts`.
- Produces:
  - `type TenseRecord = { itemId: string; tense: string; streak: number; timesSeen: number; dueAt: string | null }`
  - `type TenseMark = "learned" | "learning" | "missed" | "new"`
  - `countedTenses(table: VerbTable): string[]`
  - `recordFor(records: readonly TenseRecord[], itemId: string, tense: string): TenseRecord | undefined`
  - `tenseMark(record: TenseRecord | undefined): TenseMark`
  - `verbState(table: VerbTable, records: readonly TenseRecord[]): "new" | "learning" | "learned" | null`
  - `type PracticeVerb = { itemId: string; verb: string; tenses: string[]; rows: { person: string; cells: (string | null)[] }[] }` (`cells[k]` is the expected form for `tenses[k]`, or null when not asked)
  - `practiceVerb(table: VerbTable, tenses: readonly string[]): PracticeVerb | null`
  - `type PracticeMode = "due" | "new" | "all" | "choose"`
  - `sessionPlan(tables: readonly VerbTable[], records: readonly TenseRecord[], request: { mode: PracticeMode; tenses: readonly string[]; verbIds: readonly string[] }, now: Date): PracticeVerb[]`
  - `markForm(typed: string, expected: string, separators: string): boolean`
  - `tenseRight(verb: PracticeVerb, tenseAt: number, answers: Readonly<Record<string, string>>, separators: string): boolean` (answers keyed `"row:tenseAt"`)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/verbPractice.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { VerbTable } from "@/lib/types";
import {
  countedTenses, markForm, practiceVerb, sessionPlan, tenseMark, tenseRight, verbState,
  type TenseRecord,
} from "@/lib/verbPractice";

const table = (over: Partial<VerbTable> = {}): VerbTable => ({
  id: "v1",
  verb: "gehen",
  tenses: ["Präsens", "Perfekt", "Futur"],
  rows: [
    { person: "ich", conjugations: ["gehe", "bin gegangen", ""], notes: "" },
    { person: "du", conjugations: ["gehst", "", ""], notes: "" },
  ],
  ref: "",
  createdAt: "2026-10-01T00:00:00.000Z",
  ...over,
} as VerbTable);

const rec = (tense: string, streak: number, dueAt: string | null = null, itemId = "v1"): TenseRecord => ({
  itemId, tense, streak, timesSeen: streak === 0 ? 1 : streak, dueAt,
});

const now = new Date("2026-10-03T12:00:00.000Z");

describe("counted tenses", () => {
  it("counts only tenses with at least one form", () => {
    expect(countedTenses(table())).toEqual(["Präsens", "Perfekt"]);
  });
});

describe("marks and states", () => {
  it("marks a tense by its record", () => {
    expect(tenseMark(undefined)).toBe("new");
    expect(tenseMark(rec("Präsens", 0))).toBe("missed");
    expect(tenseMark(rec("Präsens", 1))).toBe("learning");
    expect(tenseMark(rec("Präsens", 2))).toBe("learned");
  });

  it("learns a verb only when every counted tense is learned", () => {
    expect(verbState(table(), [])).toBe("new");
    expect(verbState(table(), [rec("Präsens", 2)])).toBe("learning");
    expect(verbState(table(), [rec("Präsens", 2), rec("Perfekt", 3)])).toBe("learned");
    expect(verbState(table({ rows: [] }), [])).toBeNull();
  });

  it("a newly added tense makes a learned verb learning again", () => {
    const grown = table({
      rows: [
        { person: "ich", conjugations: ["gehe", "bin gegangen", "werde gehen"], notes: "" },
        { person: "du", conjugations: ["gehst", "", ""], notes: "" },
      ],
    });
    expect(verbState(grown, [rec("Präsens", 2), rec("Perfekt", 2)])).toBe("learning");
  });

  it("ignores a record for a tense the table no longer has", () => {
    expect(verbState(table(), [rec("Präsens", 2), rec("Perfekt", 2), rec("Plusquamperfekt", 0)])).toBe("learned");
  });
});

describe("what a verb asks", () => {
  it("asks the chosen counted tenses, with a gap for an empty form", () => {
    expect(practiceVerb(table(), ["Perfekt", "Präsens", "Futur"])).toEqual({
      itemId: "v1",
      verb: "gehen",
      tenses: ["Präsens", "Perfekt"],
      rows: [
        { person: "ich", cells: ["gehe", "bin gegangen"] },
        { person: "du", cells: ["gehst", null] },
      ],
    });
  });

  it("asks nothing when the verb has none of the tenses", () => {
    expect(practiceVerb(table(), ["Futur", "Imperfekt"])).toBeNull();
  });
});

describe("a session", () => {
  const tables = [table(), table({ id: "v2", verb: "haben", tenses: ["Präsens"], rows: [{ person: "ich", conjugations: ["habe"], notes: "" }] })];
  const due = "2026-10-02T00:00:00.000Z";
  const later = "2026-10-09T00:00:00.000Z";

  it("asks exactly the due tenses in a due session", () => {
    const records = [rec("Präsens", 2, later), rec("Perfekt", 0, due), rec("Präsens", 1, later, "v2")];
    const plan = sessionPlan(tables, records, { mode: "due", tenses: [], verbIds: [] }, now);
    expect(plan.map((v) => [v.verb, v.tenses])).toEqual([["gehen", ["Perfekt"]]]);
  });

  it("asks the tenses not yet tried in a new session", () => {
    const plan = sessionPlan(tables, [rec("Präsens", 1, later)], { mode: "new", tenses: [], verbIds: [] }, now);
    expect(plan.map((v) => [v.verb, v.tenses])).toEqual([["gehen", ["Perfekt"]], ["haben", ["Präsens"]]]);
  });

  it("asks the ticked tenses of every verb, or of the chosen ones", () => {
    const all = sessionPlan(tables, [], { mode: "all", tenses: ["Präsens"], verbIds: [] }, now);
    expect(all.map((v) => v.verb)).toEqual(["gehen", "haben"]);
    const chosen = sessionPlan(tables, [], { mode: "choose", tenses: ["Perfekt", "Präsens"], verbIds: ["v2"] }, now);
    expect(chosen.map((v) => [v.verb, v.tenses])).toEqual([["haben", ["Präsens"]]]);
  });
});

describe("marking", () => {
  it("ignores capitals and punctuation but not accents or one wrong letter", () => {
    expect(markForm(" Gehe. ", "gehe", ",/")).toBe(true);
    expect(markForm("gehts", "gehst", ",/")).toBe(false);
    expect(markForm("bin gegagen", "bin gegangen", ",/")).toBe(false);
    expect(markForm("ete", "été", ",/")).toBe(false);
    expect(markForm("", "gehe", ",/")).toBe(false);
  });

  it("accepts any one alternative the separators offer", () => {
    expect(markForm("bist", "bist/seid", ",/")).toBe(true);
    expect(markForm("seid", "bist/seid", ",/")).toBe(true);
    expect(markForm("seid", "bist/seid", "")).toBe(false);
  });

  it("counts a tense right only when every asked box in it is right", () => {
    const verb = practiceVerb(table(), ["Präsens", "Perfekt"])!;
    const answers = { "0:0": "gehe", "1:0": "gehst", "0:1": "bin gegangen" };
    expect(tenseRight(verb, 0, answers, ",/")).toBe(true);
    expect(tenseRight(verb, 1, answers, ",/")).toBe(true);
    expect(tenseRight(verb, 0, { ...answers, "1:0": "gehts" }, ",/")).toBe(false);
  });
});
```

Run: `npx vitest run src/lib/verbPractice.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 2: Implement**

Create `src/lib/verbPractice.ts`:

```ts
// Pure: what a verb practice session asks, how an answer is marked, and what
// state a verb and its tenses are in. See Docs/verb-practice.md.

import { normaliseAnswer } from "@/lib/judgeAnswer";
import type { VerbTable } from "@/lib/types";

/** One tense's schedule, as read from `verb_tense_progress`. */
export type TenseRecord = { itemId: string; tense: string; streak: number; timesSeen: number; dueAt: string | null };

export type TenseMark = "learned" | "learning" | "missed" | "new";

/**
 * The tenses a verb is practised in: those with at least one form filled in,
 * in table order, each name once. An empty column can never be asked, so it
 * must never stop a verb counting as learned.
 */
export function countedTenses(table: VerbTable): string[] {
  const seen = new Set<string>();
  return table.tenses.filter((tense, at) => {
    if (seen.has(tense)) return false;
    const filled = table.rows.some((row) => (row.conjugations[at] ?? "").trim() !== "");
    if (filled) seen.add(tense);
    return filled;
  });
}

export function recordFor(records: readonly TenseRecord[], itemId: string, tense: string): TenseRecord | undefined {
  return records.find((record) => record.itemId === itemId && record.tense === tense);
}

/** Learned at a streak of two, as flashcards; missed when the last answer was wrong. */
export function tenseMark(record: TenseRecord | undefined): TenseMark {
  if (!record || record.timesSeen === 0) return "new";
  if (record.streak >= 2) return "learned";
  if (record.streak === 0) return "missed";
  return "learning";
}

/** Learned only when every counted tense is; null for a verb with nothing to ask. */
export function verbState(table: VerbTable, records: readonly TenseRecord[]): "new" | "learning" | "learned" | null {
  const marks = countedTenses(table).map((tense) => tenseMark(recordFor(records, table.id, tense)));
  if (marks.length === 0) return null;
  if (marks.every((mark) => mark === "learned")) return "learned";
  if (marks.some((mark) => mark !== "new")) return "learning";
  return "new";
}

/** One verb as a session asks it: `cells[k]` is the form for `tenses[k]`, null when there is none to ask. */
export type PracticeVerb = {
  itemId: string;
  verb: string;
  tenses: string[];
  rows: { person: string; cells: (string | null)[] }[];
};

/** The verb with the chosen tenses it can be asked in, in table order; null when none. */
export function practiceVerb(table: VerbTable, tenses: readonly string[]): PracticeVerb | null {
  const asked = countedTenses(table).filter((tense) => tenses.includes(tense));
  if (asked.length === 0) return null;
  const columns = asked.map((tense) => table.tenses.indexOf(tense));
  return {
    itemId: table.id,
    verb: table.verb,
    tenses: asked,
    rows: table.rows.map((row) => ({
      person: row.person,
      cells: columns.map((at) => {
        const form = (row.conjugations[at] ?? "").trim();
        return form === "" ? null : form;
      }),
    })),
  };
}

export type PracticeMode = "due" | "new" | "all" | "choose";

/**
 * The verbs a session asks, in the order of the list. Due asks exactly the
 * tenses that are due; new asks the tenses not yet tried; all and choose ask
 * the ticked tenses, of every verb or of the chosen ones.
 */
export function sessionPlan(
  tables: readonly VerbTable[],
  records: readonly TenseRecord[],
  request: { mode: PracticeMode; tenses: readonly string[]; verbIds: readonly string[] },
  now: Date,
): PracticeVerb[] {
  const plan: PracticeVerb[] = [];
  for (const table of tables) {
    if (request.mode === "choose" && !request.verbIds.includes(table.id)) continue;
    const tenses =
      request.mode === "due"
        ? countedTenses(table).filter((tense) => {
            const record = recordFor(records, table.id, tense);
            return tenseMark(record) !== "new" && record?.dueAt != null && new Date(record.dueAt) <= now;
          })
        : request.mode === "new"
          ? countedTenses(table).filter((tense) => tenseMark(recordFor(records, table.id, tense)) === "new")
          : request.tenses;
    const verb = practiceVerb(table, tenses);
    if (verb) plan.push(verb);
  }
  return plan;
}

/**
 * Whether a typed form is right. Capitals and punctuation do not count, the
 * account's separators offer alternatives ("bist/seid"), and accents do.
 * Exact otherwise: unlike a flashcard, a one-letter slip is not forgiven,
 * because the ending is what is being practised.
 */
export function markForm(typed: string, expected: string, separators: string): boolean {
  const given = normaliseAnswer(typed);
  if (given === "") return false;
  const whole = normaliseAnswer(expected);
  if (given === whole) return true;
  const characters = [...separators].filter((character) => character !== "(" && character !== ")");
  if (characters.length === 0) return false;
  const escaped = characters.map((character) => character.replace(/[\\^\]-]/g, "\\$&")).join("");
  return expected
    .split(new RegExp(`[${escaped}]`))
    .map(normaliseAnswer)
    .some((alternative) => alternative !== "" && alternative === given);
}

/** A tense is right only when every box asked in it is right. */
export function tenseRight(
  verb: PracticeVerb,
  tenseAt: number,
  answers: Readonly<Record<string, string>>,
  separators: string,
): boolean {
  return verb.rows.every((row, rowAt) => {
    const expected = row.cells[tenseAt];
    return expected === null || markForm(answers[`${rowAt}:${tenseAt}`] ?? "", expected, separators);
  });
}
```

Note: `normaliseAnswer` turns `/` and `,` into nothing special (it only strips `.,;:!?"'()[]{}`), so `"bist/seid"` normalised whole stays `"bist/seid"`; the split happens on the raw text. If a separator character is also stripped by `normaliseAnswer` (the comma), splitting the raw text first is what keeps it working; the test covers `/`.

- [ ] **Step 3: Run, mutate, run**

Run: `npx vitest run src/lib/verbPractice.test.ts` → PASS.
Break `marks.every((mark) => mark === "learned")` to `marks.some(...)`, confirm "learns a verb only when every counted tense is learned" fails, restore.

- [ ] **Step 4: Commit**

```bash
git add src/lib/verbPractice.ts src/lib/verbPractice.test.ts
git commit -m "Work out what a verb practice session asks and how it is marked" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Reading tense records and recording results

**Files:**
- Create: `src/lib/verbPracticeData.ts`, `src/lib/useTenseRecords.ts`, `src/lib/verbPracticeData.test.ts`

**Interfaces:**
- Consumes: `TenseRecord` (Task 2); `getSupabase` from `src/lib/supabaseClient.ts`; `readError` wherever `flashcards.ts` imports it from.
- Produces:
  - `readTenseRecord(row: unknown): TenseRecord | null`
  - `loadTenseRecords(): Promise<TenseRecord[]>` (throws `Error` with a readable message on failure)
  - `recordTense(itemId: string, tense: string, right: boolean, tookMs: number | null): Promise<void>`
  - `useTenseRecords(): { records: TenseRecord[]; loaded: boolean; error: string | null; reload: () => void }`

- [ ] **Step 1: Failing test for the row reader**

Create `src/lib/verbPracticeData.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { readTenseRecord } from "@/lib/verbPracticeData";

describe("readTenseRecord", () => {
  it("reads a row and refuses one without an item or a tense", () => {
    expect(readTenseRecord({ item_id: "v1", tense: "Präsens", streak: 2, times_seen: 3, due_at: "2026-10-09T00:00:00Z" }))
      .toEqual({ itemId: "v1", tense: "Präsens", streak: 2, timesSeen: 3, dueAt: "2026-10-09T00:00:00Z" });
    expect(readTenseRecord({ tense: "Präsens" })).toBeNull();
    expect(readTenseRecord({ item_id: "v1" })).toBeNull();
    expect(readTenseRecord(null)).toBeNull();
  });
});
```

Run: `npx vitest run src/lib/verbPracticeData.test.ts` → FAIL.

- [ ] **Step 2: Implement**

Create `src/lib/verbPracticeData.ts` (match `flashcards.ts`'s imports for the client and `readError`):

```ts
// Reads and writes verb practice results: tense records through the browser
// client under RLS, results through `record_tense_review`, the way flashcards
// use `record_review`. See Docs/verb-practice.md.

import { getSupabase } from "@/lib/supabaseClient";
import type { TenseRecord } from "@/lib/verbPractice";

export function readTenseRecord(row: unknown): TenseRecord | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.item_id !== "string" || typeof r.tense !== "string") return null;
  return {
    itemId: r.item_id,
    tense: r.tense,
    streak: typeof r.streak === "number" ? r.streak : 0,
    timesSeen: typeof r.times_seen === "number" ? r.times_seen : 0,
    dueAt: typeof r.due_at === "string" ? r.due_at : null,
  };
}

function client() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function loadTenseRecords(): Promise<TenseRecord[]> {
  const { data, error } = await client()
    .from("verb_tense_progress")
    .select("item_id, tense, streak, times_seen, due_at");
  if (error) throw new Error(`Could not load your verb practice: ${error.message}.`);
  return (data ?? []).map(readTenseRecord).filter((record): record is TenseRecord => record !== null);
}

/** One tense's result: right when every box in it was right. */
export async function recordTense(itemId: string, tense: string, right: boolean, tookMs: number | null): Promise<void> {
  const { error } = await client().rpc("record_tense_review", {
    target_item: itemId,
    target_tense: tense,
    answer: right ? "correct" : "again",
    took_ms: tookMs,
  });
  if (error) throw new Error(`Could not record that answer: ${error.message}.`);
}
```

Create `src/lib/useTenseRecords.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";

import type { TenseRecord } from "@/lib/verbPractice";
import { loadTenseRecords } from "@/lib/verbPracticeData";

/** The account's verb tense records, loaded once per page and on `reload`. */
export function useTenseRecords() {
  const [state, setState] = useState<{ records: TenseRecord[]; loaded: boolean; error: string | null }>({
    records: [],
    loaded: false,
    error: null,
  });
  const [round, setRound] = useState(0);

  useEffect(() => {
    let live = true;
    loadTenseRecords().then(
      (records) => live && setState({ records, loaded: true, error: null }),
      (cause: unknown) =>
        live && setState({ records: [], loaded: true, error: cause instanceof Error ? cause.message : String(cause) }),
    );
    return () => {
      live = false;
    };
  }, [round]);

  const reload = useCallback(() => setRound((n) => n + 1), []);
  return { ...state, reload };
}
```

- [ ] **Step 3: Run tests and checks, commit**

Run: `npx vitest run src/lib/verbPracticeData.test.ts` → PASS; then `npx tsc --noEmit && npx eslint src/ e2e/ && npx vitest run`.

```bash
git add src/lib/verbPracticeData.ts src/lib/verbPracticeData.test.ts src/lib/useTenseRecords.ts
git commit -m "Read verb tense records and record practice results" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The Practise dialog and the tense marks

**Files:**
- Create: `src/components/verbs/PracticeDialog.tsx`, `src/components/verbs/TenseMarks.tsx`
- Modify: `src/app/(workspace)/verbs/page.tsx`, `src/components/VerbTableCard.tsx`

**Interfaces:**
- Consumes: `useTenseRecords` (Task 3); `sessionPlan`, `countedTenses`, `tenseMark`, `recordFor`, `PracticeMode` (Task 2); `Modal`; `useVerbTables`.
- Produces: `PracticeDialog({ onClose })`; `TenseMarks({ table, records, compact? })`; the URL contract for the session page: `/verbs/practise?mode=<due|new|all|choose>&tenses=<encoded names joined by ",">&verbs=<ids joined by ",">` (tense names are `encodeURIComponent`-ed before joining, so a comma in a name survives).

- [ ] **Step 1: Tense marks**

Create `src/components/verbs/TenseMarks.tsx`:

```tsx
import { countedTenses, recordFor, tenseMark, type TenseMark, type TenseRecord } from "@/lib/verbPractice";
import type { VerbTable } from "@/lib/types";

const SYMBOL: Record<TenseMark, string> = { learned: "✓", learning: "…", missed: "✗", new: "○" };
const WORD: Record<TenseMark, string> = { learned: "learned", learning: "learning", missed: "missed last time", new: "not tried" };

/**
 * Each counted tense of a verb with its practice mark, in ink: red is kept
 * for warnings. Compact (marks only, names in the label) for a rolled-up card.
 */
export function TenseMarks({ table, records, compact = false }: { table: VerbTable; records: readonly TenseRecord[]; compact?: boolean }) {
  const tenses = countedTenses(table);
  if (tenses.length === 0) return null;
  const marks = tenses.map((tense) => ({ tense, mark: tenseMark(recordFor(records, table.id, tense)) }));
  const label = marks.map(({ tense, mark }) => `${tense || "Conjugation"} ${WORD[mark]}`).join(", ");
  return (
    <span className="flex flex-wrap gap-x-2 text-xs text-ink-soft" aria-label={label} title={label}>
      {marks.map(({ tense, mark }) => (
        <span key={tense} aria-hidden="true">
          {compact ? SYMBOL[mark] : `${tense || "Conjugation"} ${SYMBOL[mark]}`}
        </span>
      ))}
    </span>
  );
}
```

In `src/components/VerbTableCard.tsx`, add an optional prop `records?: readonly TenseRecord[]` and render `{records && <TenseMarks table={table} records={records} compact />}` inside the rolled-up header button, under the verb name (wrap the name and marks in a `<span className="min-w-0 flex flex-col">`). Keep every existing behaviour.

- [ ] **Step 2: The dialog**

Create `src/components/verbs/PracticeDialog.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Modal } from "@/components/Modal";
import { countedTenses, sessionPlan, type PracticeMode, type TenseRecord } from "@/lib/verbPractice";
import type { VerbTable } from "@/lib/types";

/**
 * Starts a verb practice session: which verbs (due, all, or chosen) and, for
 * all or chosen, which tenses. Due asks the tenses that are due; when nothing
 * is due the not-tried tenses are offered instead.
 */
export function PracticeDialog({
  tables,
  records,
  onClose,
}: {
  tables: readonly VerbTable[];
  records: readonly TenseRecord[];
  onClose: () => void;
}) {
  const router = useRouter();
  const ids = useId();
  const now = new Date();
  const dueCount = sessionPlan(tables, records, { mode: "due", tenses: [], verbIds: [] }, now).length;
  const newCount = sessionPlan(tables, records, { mode: "new", tenses: [], verbIds: [] }, now).length;
  const allTenses = [...new Set(tables.flatMap(countedTenses))];

  const [mode, setMode] = useState<PracticeMode>(dueCount > 0 ? "due" : newCount > 0 ? "new" : "all");
  const [tenses, setTenses] = useState<string[]>(allTenses.slice(0, 1));
  const [verbIds, setVerbIds] = useState<string[]>([]);

  const plan = sessionPlan(tables, records, { mode, tenses, verbIds }, now);
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  function start() {
    const params = new URLSearchParams({ mode });
    if (mode === "all" || mode === "choose") params.set("tenses", tenses.map(encodeURIComponent).join(","));
    if (mode === "choose") params.set("verbs", verbIds.join(","));
    router.push(`/verbs/practise?${params.toString()}`);
  }

  const option = (value: PracticeMode, label: string, disabled = false) => (
    <label className={`flex items-center gap-2 text-sm ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input type="radio" name={`${ids}-mode`} className="size-4 accent-accent" checked={mode === value} disabled={disabled} onChange={() => setMode(value)} />
      {label}
    </label>
  );

  return (
    <Modal title="Practise verbs" onClose={onClose}>
      <div className="space-y-4">
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-sm font-medium">Which verbs</legend>
          {option("due", `Due for review (${dueCount})`, dueCount === 0)}
          {option("new", `Tenses not yet tried (${newCount})`, newCount === 0)}
          {option("all", "All verbs")}
          {option("choose", "Choose verbs")}
        </fieldset>

        {(mode === "all" || mode === "choose") && (
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-sm font-medium">Tenses</legend>
            {allTenses.map((tense) => (
              <label key={tense} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-accent" checked={tenses.includes(tense)} onChange={() => setTenses(toggle(tenses, tense))} />
                {tense || "Conjugation"}
              </label>
            ))}
          </fieldset>
        )}

        {mode === "choose" && (
          <fieldset className="max-h-48 space-y-1.5 overflow-y-auto">
            <legend className="mb-1 text-sm font-medium">Verbs</legend>
            {tables.map((table) => (
              <label key={table.id} className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="size-4 accent-accent" checked={verbIds.includes(table.id)} onChange={() => setVerbIds(toggle(verbIds, table.id))} />
                {table.verb}
              </label>
            ))}
          </fieldset>
        )}

        <p className="text-sm text-ink-soft">
          {plan.length === 0
            ? "Nothing to ask with these choices."
            : `${plan.length} ${plan.length === 1 ? "verb" : "verbs"}, ${plan.reduce((n, v) => n + v.tenses.length, 0)} tenses.`}
        </p>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={plan.length === 0} onClick={start}>Start</button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: The Verbs page**

In `src/app/(workspace)/verbs/page.tsx`: call `useTenseRecords()` where the tables are used; pass `records` to each `VerbTableCard`; add a **Practise** button (`btn btn-primary`) beside the existing Add verb control, shown when at least one table has a counted tense, which opens `PracticeDialog` with the tables and records. Keep the page's existing layout and empty state.

- [ ] **Step 4: Checks, commit**

Run: `npx tsc --noEmit && npx eslint src/ e2e/ && npx vitest run`.

```bash
git add src/components/verbs src/app/(workspace)/verbs/page.tsx src/components/VerbTableCard.tsx
git commit -m "Add the Practise dialog and tense marks to the Verbs page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The session page

**Files:**
- Create: `src/app/(workspace)/verbs/practise/page.tsx`

**Interfaces:**
- Consumes: the URL contract (Task 4); `sessionPlan`, `tenseRight`, `markForm`, `PracticeVerb` (Task 2); `useTenseRecords`, `recordTense` (Task 3); `useVerbTables`; `useSettings` (`settings.answerSeparators`); `celebrate`, `reducedMotion` from `@/components/notebook/doodles`.

- [ ] **Step 1: The page**

Create `src/app/(workspace)/verbs/practise/page.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";

import { celebrate, reducedMotion } from "@/components/notebook/doodles";
import { useSettings } from "@/lib/useSettings";
import { useTenseRecords } from "@/lib/useTenseRecords";
import { useVerbTables } from "@/lib/useVerbTables";
import { markForm, sessionPlan, tenseRight, type PracticeMode, type PracticeVerb } from "@/lib/verbPractice";
import { recordTense } from "@/lib/verbPracticeData";

const MODES: PracticeMode[] = ["due", "new", "all", "choose"];

export default function PractisePage() {
  return (
    <Suspense fallback={null}>
      <Practise />
    </Suspense>
  );
}

function Practise() {
  const params = useSearchParams();
  const { tables, loaded: tablesLoaded } = useVerbTables();
  const { records, loaded: recordsLoaded, error } = useTenseRecords();

  if (!tablesLoaded || !recordsLoaded) {
    return <main className="notebook-page mx-auto w-full max-w-4xl flex-1 py-8"><div className="card h-48 animate-pulse" aria-hidden="true" /></main>;
  }

  const mode = (MODES.find((m) => m === params.get("mode")) ?? "due") as PracticeMode;
  const tenses = (params.get("tenses") ?? "").split(",").filter(Boolean).map(decodeURIComponent);
  const verbIds = (params.get("verbs") ?? "").split(",").filter(Boolean);
  const plan = sessionPlan(tables, records, { mode, tenses, verbIds }, new Date());

  // Mounted once with the plan, so recording results (which changes the
  // records) never changes the verbs this session asks.
  return <Session plan={plan} loadError={error} />;
}

function Session({ plan: initial, loadError }: { plan: PracticeVerb[]; loadError: string | null }) {
  const { settings } = useSettings();
  const [plan] = useState(initial);
  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const [missed, setMissed] = useState<{ verb: string; tense: string }[]>([]);
  const [rightTenses, setRightTenses] = useState(0);
  const [failure, setFailure] = useState<string | null>(loadError);
  const [message, setMessage] = useState("");
  const startedAt = useRef(Date.now());
  const card = useRef<HTMLDivElement>(null);

  if (plan.length === 0) {
    return (
      <main className="notebook-page mx-auto w-full max-w-4xl flex-1 py-8">
        <div className="card p-6 text-center">
          <h1 className="hand-title text-xl">Nothing to practise</h1>
          <Link href="/verbs" className="btn btn-primary mt-4 inline-block">Back to Verbs</Link>
        </div>
      </main>
    );
  }

  if (at >= plan.length) {
    const total = plan.reduce((n, v) => n + v.tenses.length, 0);
    return (
      <main className="notebook-page mx-auto w-full max-w-4xl flex-1 py-8">
        <div className="card p-6">
          <h1 className="hand-title text-2xl"><span className="marker section-purple">Practice finished</span></h1>
          <p className="mt-2">{rightTenses} of {total} tenses right.</p>
          {missed.length > 0 && (
            <>
              <h2 className="mt-4 text-sm font-semibold tracking-wide text-ink-soft uppercase">To look at again</h2>
              <ul className="mt-1 space-y-1">
                {missed.map(({ verb, tense }) => (
                  <li key={`${verb}:${tense}`}>
                    <Link href={`/verbs?verb=${encodeURIComponent(verb)}`} className="text-link underline">{verb}</Link>{" "}
                    <span className="text-ink-soft">{tense || "Conjugation"}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Link href="/verbs" className="btn btn-primary mt-5 inline-block">Back to Verbs</Link>
        </div>
      </main>
    );
  }

  const verb = plan[at];
  const separators = settings.answerSeparators;

  async function check() {
    setChecked(true);
    const took = Date.now() - startedAt.current;
    const results = verb.tenses.map((tense, k) => ({ tense, right: tenseRight(verb, k, answers, separators) }));
    const allRight = results.every((r) => r.right);
    setRightTenses((n) => n + results.filter((r) => r.right).length);
    setMissed((list) => [...list, ...results.filter((r) => !r.right).map((r) => ({ verb: verb.verb, tense: r.tense }))]);
    setMessage(allRight ? "All right." : "Not all right. The right forms are shown.");
    const el = card.current;
    if (el && !reducedMotion()) {
      if (allRight) celebrate(el);
      else {
        el.classList.remove("wobble");
        void el.offsetWidth;
        el.classList.add("wobble");
      }
    }
    try {
      for (const r of results) await recordTense(verb.itemId, r.tense, r.right, took);
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function next() {
    setAt((n) => n + 1);
    setAnswers({});
    setChecked(false);
    setMessage("");
    startedAt.current = Date.now();
  }

  return (
    <main className="notebook-page mx-auto w-full max-w-4xl flex-1 py-8">
      <p className="text-sm text-ink-soft">Verb {at + 1} of {plan.length}</p>
      <div ref={card} className="card mt-2 p-4 sm:p-6 [--wobble-r:0deg]">
        <h1 className="hand-title text-2xl"><span className="marker section-purple">{verb.verb}</span></h1>
        {/* Scrolls sideways inside itself on a phone, never the page. */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                <th scope="col" className="w-28 px-1.5 py-1.5 font-semibold">Person</th>
                {verb.tenses.map((tense) => (
                  <th key={tense} scope="col" className="min-w-36 px-1.5 py-1.5 font-semibold">{tense || "Conjugation"}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {verb.rows.map((row, r) => (
                <tr key={r}>
                  <th scope="row" className="px-1.5 py-1 font-medium">{row.person}</th>
                  {row.cells.map((expected, k) => {
                    const key = `${r}:${k}`;
                    if (expected === null) return <td key={k} className="px-1.5 py-1 text-ink-soft">-</td>;
                    const right = checked && markForm(answers[key] ?? "", expected, separators);
                    return (
                      <td key={k} className="px-1.5 py-1 align-top">
                        <label htmlFor={`cell-${key}`} className="sr-only">{`${verb.tenses[k] || "Conjugation"} for ${row.person}`}</label>
                        <input
                          id={`cell-${key}`}
                          className={`field !px-2 !py-1 text-sm ${checked ? (right ? "!border-emerald-600" : "!border-red-600") : ""}`}
                          value={answers[key] ?? ""}
                          readOnly={checked}
                          autoComplete="off"
                          autoCapitalize="off"
                          spellCheck={false}
                          onChange={(event) => setAnswers((all) => ({ ...all, [key]: event.target.value }))}
                        />
                        {checked && !right && <span className="mt-0.5 block text-xs text-ink">{expected}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p aria-live="polite" className="mt-3 min-h-6 text-sm">{message}</p>
        {failure && <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-300">{failure}</p>}

        <div className="mt-3 flex gap-2">
          {!checked ? (
            <button type="button" className="btn btn-primary" onClick={() => void check()}>Check</button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={next}>{at + 1 < plan.length ? "Next verb" : "Finish"}</button>
          )}
          <Link href="/verbs" className="btn btn-secondary">Leave</Link>
        </div>
      </div>
    </main>
  );
}
```

Note: the red border marks a wrong box, which is an error state the owner's red rule allows. Do not put this page outside `src/app/(workspace)/`.

- [ ] **Step 2: Checks, commit**

Run: `npx tsc --noEmit && npx eslint src/ e2e/ && npx vitest run`.

```bash
git add "src/app/(workspace)/verbs/practise"
git commit -m "Add the verb practice session page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Verbs out of flashcards, verbs on the dashboard

**Files:**
- Modify: `src/lib/flashcards.ts`, `src/lib/flashcards.test.ts`, `src/components/flashcards/CreateDeckDialog.tsx` (only if it hard-codes the verb source), `src/lib/home.ts`, `src/lib/home.test.ts` (if present), `src/components/home/ReviewCard.tsx`, `src/app/(workspace)/home/page.tsx`

**Interfaces:**
- Consumes: `home_summary()`'s new columns (Task 1).
- Produces: `HomeSummary` gains `verbTensesDue`, `verbTensesNew`, `verbsNew`, `verbsLearning`, `verbsLearned` (numbers); `ReviewCard` gains a prop `verbs: { due: number; fresh: number }`.

- [ ] **Step 1: Failing tests**

In `src/lib/flashcards.test.ts`: change the `toDeckRequest` tests that expect `"verb_table"` so that the source list no longer offers it and "all" sends `["word", "phrase"]`:

```ts
  it("draws words and phrases only, verbs being practised on their own page", () => {
    expect(toDeckRequest(ask({ sources: ["all"] })).item_types).toEqual(["word", "phrase"]);
    expect(toDeckRequest(ask({ sources: [] })).item_types).toEqual(["word", "phrase"]);
    expect(SOURCE_ORDER).not.toContain("verb_table");
  });
```

and a test that a verb item in a deck yields no card (follow the file's existing `item(...)` helper for building deck rows and its function for turning rows into cards).

In `src/lib/home.test.ts` (create it beside `home.ts` if it does not exist): `readSummary` reads the five new columns, and `progressParts` adds `verbsNew`, `verbsLearning`, `verbsLearned` to New, Learning and Learned.

Run the two files → FAIL.

- [ ] **Step 2: Implement**

- `flashcards.ts`: remove `"verb_table"` from `CardSource`, `SOURCE_LABELS` and `SOURCE_ORDER`; in `toDeckRequest`, `const types = ["word", "phrase"].filter(...)` and `item_types: chosen.has("all") || types.length === 0 ? ["word", "phrase"] : types` (empty would mean every type to `build_deck`, verbs included); where deck rows become cards, return `null` for a `verb_table` item (with a comment: a verb card left in an old deck is skipped). Drop the now-unused verb branch of `cardBack` only if nothing else calls it with verbs.
- `home.ts`: add the five fields to `HomeSummary` and `readSummary` (`verb_tenses_due`, `verb_tenses_new`, `verbs_new`, `verbs_learning`, `verbs_learned`); `progressParts` counts `newItems + verbsNew`, `learning + verbsLearning`, `learned + verbsLearned`.
- `ReviewCard.tsx`: under its buttons, when `verbs.due > 0`, a line "N verb tense(s) due" with a `Link` to `/verbs/practise?mode=due` labelled **Practise verbs**; else when `verbs.fresh > 0`, "N tense(s) to learn" linking to `/verbs/practise?mode=new`. Use the file's `plural` helper. Keep the card's size modest (the dashboard fits one window).
- `home/page.tsx`: pass `verbs={{ due: summary.verbTensesDue, fresh: summary.verbTensesNew }}`.

- [ ] **Step 3: Run tests and checks, commit**

Run: `npx vitest run` → all PASS; `npx tsc --noEmit && npx eslint src/ e2e/`.

```bash
git add src/lib/flashcards.ts src/lib/flashcards.test.ts src/components/flashcards src/lib/home.ts src/lib/home.test.ts src/components/home/ReviewCard.tsx "src/app/(workspace)/home/page.tsx"
git commit -m "Take verbs out of flashcards and show verb tenses due on the dashboard" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: README, the browser pass, the build

**Files:**
- Modify: `README.md`, `HANDOFF.md` (not committed)

- [ ] **Step 1: README**

Describe verb practice under **Verbs** (the Practise dialog, the session, exact marking, the tense marks), update **Flashcards** (words and phrases only; verbs are practised on the Verbs page), **Home** (the verb tenses due line; progress counts a verb by its tenses), the schema summary (twelve tables, ten functions) wherever the README states counts, the code layout (`src/components/verbs/`, `verbPractice.ts`, `verbPracticeData.ts`), and link `Docs/verb-practice.md`. Update the test file count in "Checking the code".

- [ ] **Step 2: Browser pass on the local stack**

Follow CLAUDE.md's local-stack procedure. With a throwaway account holding two verb tables (one with two filled tenses and an empty column, one with one tense):
- Verbs page: tense marks show ○ for every counted tense, none for the empty column; **Practise** opens the dialog, "Tenses not yet tried" is chosen, the count is right.
- Session: Tab moves across then to the next row; Enter moves down a column; Check marks green and red with the right form shown; a fully right verb celebrates; a wrong one wobbles; "Verb 2 of 2"; the end screen lists the misses with links.
- Database: `verb_tense_progress` rows and `reviews.tense` values match what was answered.
- Back on Verbs: marks show ✓, …, ✗ as answered.
- Dashboard: Ready for review ignores verbs; the verb tenses line and its button start a due or new session; Your progress counts verbs by tenses.
- Reload the session page mid-session: it starts the same plan afresh (the plan comes from the URL and current records; recorded tenses that are no longer due drop out, which is expected).
- Phone width 400px: the table scrolls inside itself with three tenses; no page-wide sideways scroll. Light and dark.
Afterwards: stop your dev server, delete `.env.development.local`, `npx supabase stop`.

- [ ] **Step 3: Build**

Run: `npm run build` (dev server stopped). Expected: success; `/verbs/practise` is listed as `ƒ` (dynamic) with the other workspace routes.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "Describe verb practice in the README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
