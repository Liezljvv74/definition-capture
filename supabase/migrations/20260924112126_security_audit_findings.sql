-- Findings from a security audit of the schema as it stands after every
-- earlier migration. Nothing here let one account read another's rows. What
-- it found was a guarantee the design states that the database did not keep,
-- a security definer function trusting two of its arguments, two policies that
-- accepted a reference to another account's row, and some loose ends the
-- Security Advisor flags. Numbered to match the sections below.

/* ------------------------------------ 1. review_logs, append-only at last */

-- `20260922111217_review_findings` meant to drop the client's insert policy on
-- `review_logs`, so that every row comes from `apply_review` and replaying the
-- log reproduces `progress_summary`. It dropped a policy by the wrong name,
-- "Users add their own review logs", and `if exists` turned the mistake into a
-- silent no-op: the policy was created as "Users record their own reviews",
-- and it has been live ever since. `Docs/schema.md` has said it was gone.
--
-- `if exists` stays, because this migration has to apply cleanly to a
-- database where the policy was removed by hand. The lesson is in the check
-- below it: a drop that can silently do nothing is followed by an assertion
-- that it did something.
drop policy if exists "Users record their own reviews" on public.review_logs;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'review_logs' and cmd <> 'SELECT'
  ) then
    raise exception 'review_logs still has a policy that writes';
  end if;
end;
$$;

/* ------------------------------- 2. apply_review trusts only its own item */

-- `apply_review` is still the one security definer function, and still in
-- `public`: PostgREST exposes that schema and no other, and moving the
-- function out of it would take it off the API the flashcard screen calls.
-- What the audit found was inside it. The guard checks that the item is the
-- caller's, but `deck` and `session` went unchecked: `deck` was written into
-- `review_logs` as given and used to find the `deck_items` row to update, and
-- `session` was written into `review_logs` as given. Neither could reach
-- another account's rows today, because the item has to be the caller's, but
-- in a function that bypasses row level security the body is the only gate,
-- and a gate that depends on every future edit remembering why is a weak one.
--
-- A deck or session that is not the caller's is now recorded as none, rather
-- than refused. The answer itself is still the caller's own to record, and a
-- deck deleted in another tab mid-review should not turn every remaining card
-- into an error.
--
-- `search_path` is now empty rather than `public`. Every name in the body was
-- already qualified, so this changes nothing but the one thing it is for: an
-- object created later in a schema on the path can no longer stand in for one
-- this function means.
--
-- The body is otherwise unchanged from `20260922105919`.

create or replace function public.apply_review(
  target_item uuid,
  answer text,
  deck uuid default null,
  session uuid default null,
  took_ms integer default null,
  local_day date default null
) returns public.progress_summary
language plpgsql security definer set search_path = '' as $$
declare
  owner uuid;
  prior public.progress_summary;
  next_ease numeric(4, 2);
  next_interval numeric(6, 2);
  next_streak integer;
  next_lapses integer;
  next_mastery text;
  result public.progress_summary;
begin
  -- Two checks, not one, and the order matters; see `20260922105919`.
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select user_id into owner from public.learning_items where id = target_item;
  if owner is null or owner is distinct from auth.uid() then
    raise exception 'not your item';
  end if;

  -- The two arguments the guard above does not cover.
  if deck is not null and not exists (
    select 1 from public.flashcard_decks d where d.id = deck and d.user_id = owner
  ) then
    deck := null;
  end if;

  if session is not null and not exists (
    select 1 from public.study_sessions s where s.id = session and s.user_id = owner
  ) then
    session := null;
  end if;

  select * into prior from public.progress_summary where item_id = target_item;
  if not found then
    prior := row(target_item, owner, 0, 0, 0, 0, 2.50, 0, null, null, 'new');
  end if;

  next_ease := prior.ease;
  next_lapses := prior.lapses;

  if answer = 'correct' then
    next_streak := prior.streak + 1;
    next_interval := case
      when prior.streak = 0 then 1
      when prior.streak = 1 then 6
      else greatest(1, round(prior.interval_days * prior.ease))
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

  next_mastery := case
    when next_streak = 0 and prior.times_seen = 0 then 'new'
    when next_streak = 0 then 'learning'
    when next_streak = 1 then 'learning'
    when next_interval < 7 then 'familiar'
    when next_interval < 21 then 'known'
    else 'mastered'
  end;

  insert into public.review_logs
    (user_id, item_id, deck_id, session_id, outcome, response_ms,
     prior_interval_days, prior_ease, next_due_at)
  values
    (owner, target_item, deck, session, answer, took_ms,
     prior.interval_days, prior.ease,
     now() + make_interval(days => next_interval::integer));

  insert into public.progress_summary as p
    (item_id, user_id, times_seen, times_correct, streak, lapses, ease,
     interval_days, due_at, last_reviewed_at, mastery)
  values
    (target_item, owner, 1, case when answer = 'correct' then 1 else 0 end,
     next_streak, next_lapses, next_ease, next_interval,
     now() + make_interval(days => next_interval::integer), now(), next_mastery)
  on conflict (item_id) do update set
    times_seen = p.times_seen + 1,
    times_correct = p.times_correct + case when answer = 'correct' then 1 else 0 end,
    streak = excluded.streak,
    lapses = excluded.lapses,
    ease = excluded.ease,
    interval_days = excluded.interval_days,
    due_at = excluded.due_at,
    last_reviewed_at = excluded.last_reviewed_at,
    mastery = excluded.mastery
  returning * into result;

  insert into public.daily_study as d (user_id, day, reviewed_count, correct_count)
  values (owner, coalesce(local_day, current_date), 1,
          case when answer = 'correct' then 1 else 0 end)
  on conflict (user_id, day) do update set
    reviewed_count = d.reviewed_count + 1,
    correct_count = d.correct_count + case when answer = 'correct' then 1 else 0 end;

  if deck is not null then
    update public.deck_items set
      answered_at = now(),
      outcome = answer,
      attempts = attempts + 1
    where deck_id = deck and item_id = target_item;
  end if;

  if session is not null then
    update public.study_sessions set
      reviewed_count = reviewed_count + 1,
      correct_count = correct_count + case when answer = 'correct' then 1 else 0 end
    where id = session and user_id = owner;
  end if;

  return result;
end;
$$;

-- `create or replace` keeps the grants `20260922105919` set, and these repeat
-- them so the function's whole security posture is readable in one place.
revoke execute on function
  public.apply_review(uuid, text, uuid, uuid, integer, date) from public, anon;
grant execute on function
  public.apply_review(uuid, text, uuid, uuid, integer, date) to authenticated;

/* ---------------- 3 and 4. a reference to a row has to be to your own row */

-- Both of these checked one side of a join table and not the other. A reader
-- could attach another account's tag to their own item, or put another
-- account's item into their own deck. Nothing leaked: the other side's row
-- stayed hidden behind its own policy. But the foreign key would accept or
-- refuse a guessed id, which is enough to learn that the id exists, and a
-- policy that accepts a reference to a row the caller cannot see is not
-- saying what it means. Each `with check` now asks about both sides. The
-- `using` side stays as it was: it decides which existing rows the caller may
-- touch, and the item or deck already answers that.

drop policy "Users write their own item tags" on public.item_tags;
create policy "Users write their own item tags"
  on public.item_tags for all to authenticated
  using (exists (
    select 1 from public.learning_items i
    where i.id = item_tags.item_id and i.user_id = (select auth.uid())
  ))
  with check (
    exists (
      select 1 from public.learning_items i
      where i.id = item_tags.item_id and i.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.tags t
      where t.id = item_tags.tag_id and t.user_id = (select auth.uid())
    )
  );

drop policy "Users write their own deck items" on public.deck_items;
create policy "Users write their own deck items"
  on public.deck_items for all to authenticated
  using (exists (
    select 1 from public.flashcard_decks d
    where d.id = deck_items.deck_id and d.user_id = (select auth.uid())
  ))
  with check (
    exists (
      select 1 from public.flashcard_decks d
      where d.id = deck_items.deck_id and d.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.learning_items i
      where i.id = deck_items.item_id and i.user_id = (select auth.uid())
    )
  );

/* ------------------------------------------ 5. a fixed search_path for all */

-- The rest of the functions are security invoker, so none of them runs with
-- more rights than its caller, and the Security Advisor flags them anyway
-- under "Function Search Path Mutable". An empty path is free here: every
-- body already names its tables with `public.` and calls `auth.uid()` in
-- full, and built-ins such as `now()` and `gen_random_uuid()` are found in
-- `pg_catalog`, which is searched whatever the path says.
alter function public.set_item_categories(uuid, uuid, text[]) set search_path = '';
alter function public.sync_category_tags(text[]) set search_path = '';
alter function public.build_flashcard_deck(text[], uuid[], boolean, boolean, integer, text)
  set search_path = '';
alter function public.words_write() set search_path = '';
alter function public.phrases_write() set search_path = '';
alter function public.verb_tables_write() set search_path = '';

/* ------------------------------------- 6. signed-in callers only, for all */

-- Execute on a function is granted to `public` by default, which under
-- Supabase includes `anon`. `apply_review` had that taken away as a second
-- lock; these three are given the same. None of them did anything for a
-- caller with no session, since the first two refuse one and the third
-- writes nothing row level security would let through, but nothing in this
-- project calls them signed out, and a function that cannot be reached
-- cannot be got wrong.
--
-- `set_item_categories` stays callable by `authenticated` because the view
-- triggers call it on the signed-in reader's behalf, and a security invoker
-- function called from one still needs the caller's execute right. Section 7
-- stops it trusting the owner it is given.
revoke execute on function public.build_flashcard_deck(text[], uuid[], boolean, boolean, integer, text)
  from public, anon;
grant execute on function public.build_flashcard_deck(text[], uuid[], boolean, boolean, integer, text)
  to authenticated;

revoke execute on function public.sync_category_tags(text[]) from public, anon;
grant execute on function public.sync_category_tags(text[]) to authenticated;

revoke execute on function public.set_item_categories(uuid, uuid, text[]) from public, anon;
grant execute on function public.set_item_categories(uuid, uuid, text[]) to authenticated;

/* ----------------------------- 7. set_item_categories trusts no owner id */

-- It takes the owner as an argument, from the view triggers, and relied on
-- the `tags` and `item_tags` policies to refuse one that was not the caller.
-- They do. But `authenticated` can call it directly as an RPC, and a function
-- that writes on behalf of whatever owner it is handed should not need the
-- policies behind it to be right. It now refuses an owner that is not the
-- signed-in caller.
--
-- The argument stays, rather than being replaced by `auth.uid()` inside, so
-- the triggers that pass it keep working unchanged. One consequence worth
-- knowing: a future migration writing through the views as `postgres` has no
-- `auth.uid()`, and this will refuse it. That is the right failure, loud and
-- at once; such a migration should write the tables directly, as the backfill
-- did.
--
-- `create or replace` keeps the grants from section 6. It replaces the
-- function's settings, so the empty `search_path` from section 5 is given
-- again here.
create or replace function public.set_item_categories(
  target_item uuid,
  owner uuid,
  names text[]
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  clean text[] := coalesce(names, '{}');
begin
  if auth.uid() is null or owner is distinct from auth.uid() then
    raise exception 'not your item';
  end if;

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

/* --------------------------- 8. the next function, signed-in only as well */

-- Sections 2 and 6 take execute away from `anon` one function at a time,
-- which is right for what exists and does nothing for what comes next: every
-- function created afterwards is executable by `anon` again, through two
-- routes, and neither says so at the time.
--
-- The first is Postgres's own default, which grants execute on every new
-- function to `public`. Postgres only lets that be withdrawn for every schema
-- at once, not for one, so this revoke is global for functions `postgres`
-- creates. Nothing in this project relies on it: the functions here are
-- called by signed-in readers, and `authenticated` and `service_role` keep
-- execute through the grants Supabase sets per schema.
--
-- The second is Supabase's default for the `public` schema, which grants
-- execute on new functions to `anon` by name. That one is per schema and is
-- withdrawn per schema.
--
-- A function that does need to be called signed out, and nothing here does,
-- then has to be granted to `anon` on purpose, which is the point.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
