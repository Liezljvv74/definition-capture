-- Grammar rules. The fourth list, and the first one the Grammar page has had
-- — until now that route was a heading over an empty page.
--
-- A rule is a title, the explanation, the examples that make it land, and a
-- Ref like every other list has. `category` is free text on the row rather
-- than a list in `user_settings`, unlike a term's categories: the grammar
-- vocabulary a reader uses ("Cases", "Word order") is their own and grows as
-- they write, and the page builds its filter from the categories actually in
-- use. That keeps a new grammar category from needing a settings round trip.
--
-- Singular `category`, not an array. A term can sit in several groups because
-- a word can be about several things at once; a rule is about one thing, and
-- offering three slots would invite filing the same rule three ways.

create table public.grammar_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  title text not null check (length(trim(title)) > 0),

  -- Blank is a real answer: a rule can be captured before it is filed.
  category text not null default '',

  explanation text not null default '',

  -- One block of free text rather than a list. Examples are read together,
  -- often as a sentence and its translation on the next line, and a jsonb
  -- array would impose a structure the reader has not asked for.
  examples text not null default '',

  ref text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- One rule per title, matched the way every other list matches its names.
-- `lower()` here and `foldName` in the app agree on case; the app also folds
-- accents to NFC, which makes it the stricter of the two and so cannot
-- produce a row this index would refuse.
create unique index grammar_rules_user_title_key
  on public.grammar_rules (user_id, lower(title));

-- The Grammar page lists them newest first, the same as the other lists.
create index grammar_rules_user_created_at_idx
  on public.grammar_rules (user_id, created_at desc);

/* ------------------------------------------------------ row level security */

alter table public.grammar_rules enable row level security;

create policy "Users read their own grammar rules"
  on public.grammar_rules for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create their own grammar rules"
  on public.grammar_rules for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own grammar rules"
  on public.grammar_rules for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own grammar rules"
  on public.grammar_rules for delete to authenticated
  using ((select auth.uid()) = user_id);
