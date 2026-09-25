-- Indexes for a much larger dataset, from measurements rather than guesses.
--
-- Every query path the app runs was timed with `explain analyze` against a
-- local database of 1,001 accounts: one with 20,000 items, 300,000 reviews
-- and 15,000 progress rows, and a thousand others with 200 items each (220,000
-- items, 360,000 reviews, 500,000 deck cards in all), with row level security
-- applied as it is in the app. `Docs/schema.md` has the numbers. Two indexes
-- came out of it; everything else was already served by an index, or was fast
-- because it only ever touches one account's rows through a key.
--
-- A plain `create index` blocks writes to its table while it builds. At the
-- size these tables are when this runs, that is milliseconds. On a table that
-- has really grown, build the index with `create index concurrently` in a
-- migration of its own instead, since that cannot run inside the transaction
-- a migration file is applied in.

/* ------------------------------------------- progress, found by its owner */

-- The one table whose policy column did not lead an index. `build_deck` joins
-- the caller's items to their progress, and row level security filters
-- `progress` by `user_id`; with only the primary key on `item_id`, Postgres
-- read the whole table, every account's rows, and threw away all but the
-- caller's. That cost grows with the number of accounts, not with the
-- caller's own data, which is the wrong way round.
--
-- `(user_id, item_id)` finds one account's rows directly, and `include
-- (due_at)` lets the deck builder read the due date from the index without
-- visiting the table. Measured: a full scan of 45,000 rows became an
-- index-only scan of the caller's 15,000, with no table reads.
create index progress_user_item_idx on public.progress (user_id, item_id) include (due_at);

/* ------------------------------------ reviews, as a history is drawn from */

-- The index the history view will read, made covering. Drawing accuracy and
-- speed per day reads every review in a range of dates; with the outcome and
-- the response time in the index, it never has to visit the table. Measured
-- on 37,000 reviews over 90 days: 111 ms became 44 ms, from the index alone.
-- It replaces the plain index on the same key, which it makes redundant.
create index reviews_user_reviewed_cover
  on public.reviews (user_id, reviewed_at desc) include (outcome, response_ms);
drop index public.reviews_user_reviewed_idx;
alter index public.reviews_user_reviewed_cover rename to reviews_user_reviewed_idx;

do $$
begin
  if to_regclass('public.progress_user_item_idx') is null
     or to_regclass('public.reviews_user_reviewed_idx') is null
     or to_regclass('public.reviews_user_reviewed_cover') is not null then
    raise exception 'the index changes did not land as expected';
  end if;
end;
$$;
