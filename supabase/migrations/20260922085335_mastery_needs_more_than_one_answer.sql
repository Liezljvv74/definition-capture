-- One correct answer is not familiarity.
--
-- The first rule keyed `familiar` off the interval alone, and a single
-- correct answer sets the interval to one day, so answering a card once
-- promoted it straight past `learning`. A dashboard saying a reader is
-- familiar with something they have seen exactly once is not a summary, it is
-- a flattering guess, and the number it feeds is the one they would use to
-- decide what to study next.
--
-- A streak of one is now `learning` explicitly, so the ladder is: never seen,
-- seen and not known, known once, known twice (six days), known enough that
-- the interval has stretched past three weeks.
--
-- Safe to change at any time. `progress_summary` is derived, so if these
-- thresholds move again the column can be recomputed by replaying
-- `review_logs`; nothing depends on the old values having been right.
--
-- Only the `next_mastery` expression differs from the previous definition.

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
  select user_id into owner from public.learning_items where id = target_item;
  if owner is null or owner <> auth.uid() then
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
