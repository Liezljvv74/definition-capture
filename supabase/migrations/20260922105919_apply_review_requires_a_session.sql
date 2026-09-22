-- An ownership check that let an unauthenticated caller through.
--
-- `apply_review` is the one security definer function in this schema, which is
-- deliberate: it writes `review_logs`, `progress_summary` and `daily_study`,
-- and the client holds no insert or update policy on the last two, so that a
-- reader cannot award themselves a mastery they have not earned. Running as
-- definer means row level security does not apply inside it, and the guard at
-- the top is therefore the only thing standing between a caller and any row.
--
-- The guard read `if owner is null or owner <> auth.uid()`. For a caller with
-- no session `auth.uid()` is null, so `owner <> null` is null, not true. The
-- whole condition is then null, PL/pgSQL treats that as false, and the
-- function carried on with `owner` set to whoever really owns the item. The
-- function is reachable with the publishable key alone, which is compiled into
-- the browser bundle by design, and the item id it needs is not a secret: it
-- travels in `?id=` links and sits in every backup file. So an anonymous
-- request could write a review into someone else's history, overwrite that
-- item's progress row, and read the result back out of the return value.
--
-- The function body below is unchanged apart from the guard. `is distinct
-- from` is the null-safe comparison and is worth preferring in any
-- authorization test; the explicit "not signed in" check in front of it says
-- the same thing twice on purpose, because this is the one place in the schema
-- where being wrong is not merely a bug. `build_flashcard_deck` already opens
-- this way, which is where the shape comes from.
--
-- The revoke is the second lock. Nothing in this project calls this function
-- unauthenticated, so `anon` has no business executing it at all, and a guard
-- that is never reached cannot be got wrong again.

create or replace function public.apply_review(
  target_item uuid,
  answer text,
  deck uuid default null,
  session uuid default null,
  took_ms integer default null,
  local_day date default null
) returns public.progress_summary
language plpgsql security definer set search_path = public as $$
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
  -- Two checks, not one, and the order matters. `auth.uid()` is null for a
  -- caller with no session, and `owner <> null` is null rather than true, so
  -- the single check below used to evaluate to null for any item that exists.
  -- PL/pgSQL treats a null condition as false, which meant the guard let an
  -- anonymous caller straight through into a security definer function.
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select user_id into owner from public.learning_items where id = target_item;
  -- `is distinct from` rather than `<>`: null-safe, and in an ownership test
  -- that is the whole difference between refusing and admitting.
  if owner is null or owner is distinct from auth.uid() then
    raise exception 'not your item';
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
    -- The line this migration exists for.
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

-- Default execute on a function is granted to public, which under Supabase
-- includes `anon`. Nothing but a signed-in reader ever needs this.
revoke execute on function
  public.apply_review(uuid, text, uuid, uuid, integer, date) from public, anon;
grant execute on function
  public.apply_review(uuid, text, uuid, uuid, integer, date) to authenticated;
