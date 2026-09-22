-- Reviews, decks, progress, goals and streaks.
--
-- The shape of this half is one rule: `review_logs` is the truth and
-- everything else is derived from it. Every answer the reader gives is
-- appended and never changed, so the history can always be replayed, a
-- scheduling algorithm can be swapped without losing what happened under the
-- old one, and a bug in the summary is a recomputation rather than a loss.
--
-- `progress_summary` is that recomputation kept current. It exists because a
-- dashboard asking "what is due?" cannot afford to aggregate a review log
-- every time, and because the review queue is the one query this app will run
-- most often.

/* -------------------------------------------------------------- review_logs */

create table public.review_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.learning_items (id) on delete cascade,

  -- Which deck and sitting this answer came from, if any. Nullable because a
  -- review can happen outside both, and because a deck being deleted must not
  -- delete the history of what was learned from it.
  deck_id uuid,
  session_id uuid,

  reviewed_at timestamptz not null default now(),

  -- 'again' rather than 'incorrect' because that is what the reader chose,
  -- not a judgement: they pressed the button that means show me this one
  -- again. 'revealed' is the third option the card offers, and it is
  -- deliberately not the same as getting it wrong.
  outcome text not null check (outcome in ('correct', 'again', 'revealed', 'skipped')),

  -- How long the answer took. Useful for spotting the cards that are known
  -- but not yet fluent, and cheap to store.
  response_ms integer check (response_ms is null or response_ms >= 0),

  -- What the scheduler thought at the moment of the answer. Snapshots, not
  -- references: they are what makes the log replayable and lets a later
  -- algorithm be compared against the one that was running at the time.
  prior_interval_days numeric(6, 2),
  prior_ease numeric(4, 2),
  next_due_at timestamptz
);

-- The dashboard's "what did I do lately", and the streak rollup's source.
create index review_logs_user_reviewed_idx
  on public.review_logs (user_id, reviewed_at desc);

-- One item's history, for the detail page and for replaying a summary.
create index review_logs_item_reviewed_idx
  on public.review_logs (item_id, reviewed_at desc);

create index review_logs_deck_idx
  on public.review_logs (deck_id) where deck_id is not null;

alter table public.review_logs enable row level security;

-- Select and insert only, and that omission is the design. Append-only is
-- worth nothing if the client can edit what it appended, and there is no
-- honest reason to change the record of an answer already given.
create policy "Users read their own review history"
  on public.review_logs for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users record their own reviews"
  on public.review_logs for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.learning_items i
      where i.id = item_id and i.user_id = (select auth.uid())
    )
  );

/* --------------------------------------------------------- progress_summary */

-- One row per item the reader has ever answered. Derived from `review_logs`
-- by the trigger below, and safe to delete and rebuild.
create table public.progress_summary (
  item_id uuid primary key references public.learning_items (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,

  times_seen integer not null default 0,
  times_correct integer not null default 0,
  -- Consecutive correct answers. Resets to zero on anything else, which is
  -- what makes it mean "currently known" rather than "once knew".
  streak integer not null default 0,
  lapses integer not null default 0,

  -- SM-2's two numbers. `ease` is how generously the interval grows; 2.5 is
  -- the conventional start and 1.3 the floor below which a card is simply
  -- difficult and should keep coming back.
  ease numeric(4, 2) not null default 2.50 check (ease >= 1.30),
  interval_days numeric(6, 2) not null default 0,

  due_at timestamptz,
  last_reviewed_at timestamptz,

  -- Cached so a dashboard can group by it without recomputing thresholds in
  -- five different places. Derived from streak and interval; see
  -- `apply_review` for the one place it is decided.
  mastery text not null default 'new'
    check (mastery in ('new', 'learning', 'familiar', 'known', 'mastered'))
);

-- The review queue, and the reason this table exists at all: everything due
-- for one reader, soonest first. Partial, because a card with no due date is
-- one that has never been answered and is found through `learning_items`.
create index progress_summary_user_due_idx
  on public.progress_summary (user_id, due_at)
  where due_at is not null;

-- The dashboard's breakdown by how well things are known.
create index progress_summary_user_mastery_idx
  on public.progress_summary (user_id, mastery);

alter table public.progress_summary enable row level security;

-- No insert or update policy for the client either. These rows are written by
-- the trigger, which runs as the definer, so a reader cannot award themselves
-- a mastery they have not earned or push a card's due date away.
create policy "Users read their own progress"
  on public.progress_summary for select to authenticated
  using ((select auth.uid()) = user_id);

/* ---------------------------------------------------------- study_sessions */

-- One sitting. Kept separate from decks because a session may span several
-- decks and a deck may be picked up over several sittings.
create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  -- Counters, so the sessions list needs no aggregate over `review_logs`.
  reviewed_count integer not null default 0,
  correct_count integer not null default 0
);

create index study_sessions_user_started_idx
  on public.study_sessions (user_id, started_at desc);

alter table public.study_sessions enable row level security;

create policy "Users read their own sessions"
  on public.study_sessions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users write their own sessions"
  on public.study_sessions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

/* ------------------------------------------------------------ daily_study */

-- One row per reader per day. A streak is then a walk backwards through
-- consecutive dates rather than an aggregate over every review ever recorded,
-- and the answer does not get slower as the history grows.
create table public.daily_study (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- The reader's own date, not UTC: a streak is about days as they live them.
  -- The application passes the day it means; see `apply_review`.
  day date not null,
  reviewed_count integer not null default 0,
  correct_count integer not null default 0,
  primary key (user_id, day)
);

-- The primary key already answers "this reader, walking back from today",
-- which is the only question this table is asked.

alter table public.daily_study enable row level security;

create policy "Users read their own daily study"
  on public.daily_study for select to authenticated
  using ((select auth.uid()) = user_id);

/* -------------------------------------------------------------- user_goals */

create table public.user_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- A kind rather than a column per goal, so a new one is a row.
  kind text not null check (kind in ('daily_reviews', 'daily_new_items', 'weekly_minutes')),
  target integer not null check (target > 0),
  starts_on date not null default current_date,
  -- Null means it is still running. History is kept rather than overwritten,
  -- so "I used to do ten a day" survives raising it to twenty.
  ends_on date,
  created_at timestamptz not null default now()
);

-- One live goal of each kind. Partial, so an ended goal of the same kind does
-- not block setting a new one.
create unique index user_goals_one_live_per_kind
  on public.user_goals (user_id, kind)
  where ends_on is null;

alter table public.user_goals enable row level security;

create policy "Users read their own goals"
  on public.user_goals for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users write their own goals"
  on public.user_goals for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

/* --------------------------------------------------------- flashcard_decks */

create table public.flashcard_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default '',

  -- What the reader asked for, kept so a deck can be explained after the fact
  -- and repeated. Jsonb because it is a record of a choice rather than
  -- something queried: the filters are applied once, when the deck is built.
  -- Anything that needs filtering or sorting belongs in a column instead.
  source_types text[] not null default '{}',
  filters jsonb not null default '{}'::jsonb
    check (jsonb_typeof(filters) = 'object'),

  requested_size integer not null default 50 check (requested_size between 1 and 500),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index flashcard_decks_user_created_idx
  on public.flashcard_decks (user_id, created_at desc);

alter table public.flashcard_decks enable row level security;

create policy "Users read their own decks"
  on public.flashcard_decks for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users write their own decks"
  on public.flashcard_decks for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

/* ------------------------------------------------------------- deck_items */

-- The cards in a deck, in the order they are asked. Snapshotting the
-- selection rather than re-running the filter each time is what lets a deck
-- be put down and picked up: a word edited half way through does not silently
-- leave the deck it was already in.
create table public.deck_items (
  deck_id uuid not null references public.flashcard_decks (id) on delete cascade,
  item_id uuid not null references public.learning_items (id) on delete cascade,
  position integer not null,
  answered_at timestamptz,
  outcome text check (outcome in ('correct', 'again', 'revealed', 'skipped')),
  attempts integer not null default 0,
  primary key (deck_id, item_id)
);

-- "The next unanswered card in this deck", which is the query the review
-- screen runs between every card.
create index deck_items_deck_position_idx
  on public.deck_items (deck_id, position)
  where answered_at is null;

alter table public.deck_items enable row level security;

create policy "Users read their own deck items"
  on public.deck_items for select to authenticated
  using (exists (
    select 1 from public.flashcard_decks d
    where d.id = deck_items.deck_id and d.user_id = (select auth.uid())
  ));
create policy "Users write their own deck items"
  on public.deck_items for all to authenticated
  using (exists (
    select 1 from public.flashcard_decks d
    where d.id = deck_items.deck_id and d.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.flashcard_decks d
    where d.id = deck_items.deck_id and d.user_id = (select auth.uid())
  ));

/* ----------------------------------------------------- the scheduler itself */

-- SM-2, trimmed to what this app needs.
--
-- It lives here rather than in the browser for three reasons: the summary it
-- writes is not client-writable, every caller gets the same arithmetic, and
-- the whole thing runs in the transaction that records the answer, so a
-- summary can never disagree with the log it was derived from.
--
-- Changing the algorithm later means changing this function and, if the
-- numbers should be restated, replaying `review_logs` into a fresh
-- `progress_summary`. Nothing is lost by changing your mind.
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
  -- `security definer`, so ownership is checked here rather than assumed.
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
    -- 1 day, then 6, then multiplied by ease. The two fixed steps are what
    -- stop a brand new card jumping straight to a fortnight.
    next_interval := case
      when prior.streak = 0 then 1
      when prior.streak = 1 then 6
      else greatest(1, round(prior.interval_days * prior.ease))
    end;
    next_ease := least(3.00, prior.ease + 0.10);
  elsif answer = 'skipped' then
    -- Neither known nor failed. Ask again next time, change nothing else.
    next_streak := prior.streak;
    next_interval := 0;
  else
    -- 'again' and 'revealed' both mean it was not known.
    next_streak := 0;
    next_lapses := prior.lapses + 1;
    next_interval := 0;
    next_ease := greatest(1.30, prior.ease - 0.20);
  end if;

  next_mastery := case
    when next_streak = 0 and prior.times_seen = 0 then 'new'
    when next_streak = 0 then 'learning'
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

  -- The streak rollup. The reader's own date is passed in, because a review
  -- at eleven at night belongs to the day they think it does.
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

/* ------------------------------------------------------- building a deck */

-- One call builds the deck the Home page's challenge asks for: some sources,
-- some filters, a size. Server-side because the selection is a query, and
-- sending a few thousand candidate rows to the browser to pick fifty of them
-- would be the wrong half of the work in the wrong place.
--
-- `sources` is the list of item types, empty meaning all of them, which is
-- what makes "All items" the default without a special case. `only_recent`
-- is the "most recently added" source: it orders by age instead of sampling.
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
begin
  if owner is null then
    raise exception 'not signed in';
  end if;

  insert into public.flashcard_decks
    (user_id, name, source_types, requested_size, filters)
  values (
    owner, deck_name, coalesce(sources, '{}'), greatest(1, least(500, size)),
    jsonb_build_object(
      'category_ids', to_jsonb(coalesce(category_ids, '{}')),
      'needs_review', only_needs_review,
      'most_recent', only_recent
    )
  )
  returning id into deck;

  insert into public.deck_items (deck_id, item_id, position)
  select deck, candidate.id, row_number() over ()
  from (
    select i.id
    from public.learning_items i
    where i.user_id = owner
      and (cardinality(coalesce(sources, '{}')) = 0 or i.item_type = any(sources))
      and (not only_needs_review or i.needs_review)
      and (
        cardinality(coalesce(category_ids, '{}')) = 0
        or exists (
          select 1 from public.item_tags it
          where it.item_id = i.id and it.tag_id = any(category_ids)
        )
      )
    order by
      case when only_recent then i.created_at end desc nulls last,
      -- Otherwise: anything overdue first, then anything never seen, then at
      -- random. That ordering is what makes a deck useful rather than merely
      -- full.
      case when only_recent then null else
        coalesce(
          (select p.due_at from public.progress_summary p where p.item_id = i.id),
          'epoch'::timestamptz
        )
      end asc,
      random()
    limit greatest(1, least(500, size))
  ) as candidate;

  return deck;
end;
$$;

comment on table public.review_logs is
  'Append-only. Every other number about progress is derived from this.';
comment on table public.progress_summary is
  'Derived from review_logs and safe to rebuild. Exists so dashboards are fast.';
comment on function public.apply_review is
  'Records one answer and updates the schedule, in one transaction.';
