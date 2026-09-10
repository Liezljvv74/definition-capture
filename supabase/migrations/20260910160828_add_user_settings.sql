-- Per-account settings: the display name, and the two lists the term form
-- offers. One row per reader, created the first time something is changed —
-- until then the app falls back to the defaults in `src/lib/constants.ts`, so
-- an account with no row here still works exactly as it did.
--
-- These are text arrays for the same reason `terms.categories` is: the whole
-- thing is a handful of short names read on every form render, and a table of
-- them would add a join to answer a question one column already answers.

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,

  display_name text not null default '',

  -- The groups a term can be filed under. A term may still carry only three;
  -- this is the list to choose those three from.
  categories text[] not null default
    '{Nature,Home,Careers,Office,Food,Travel,People,Health}',

  sources text[] not null default '{Manual,Google,Claude,ChatGPT}',

  updated_at timestamptz not null default now(),

  -- `= any(...)` rather than a subquery, which a check constraint cannot hold.
  constraint user_settings_categories_not_blank check (not ('' = any (categories))),
  constraint user_settings_sources_not_blank check (not ('' = any (sources))),

  -- A guard against a runaway list rather than a considered maximum: past a
  -- few dozen the chips stop being a usable way to pick.
  constraint user_settings_categories_sane
    check (coalesce(array_length(categories, 1), 0) <= 30),
  constraint user_settings_sources_sane
    check (coalesce(array_length(sources, 1), 0) <= 30),

  -- An empty source list would leave the add form with nothing to select.
  constraint user_settings_sources_not_empty
    check (coalesce(array_length(sources, 1), 0) >= 1)
);

/* ------------------------------------------------------ row level security */

-- Same reasoning as the lists: every query runs in the browser under the
-- publishable key, so these policies are the only thing keeping one account's
-- settings away from another's.

alter table public.user_settings enable row level security;

create policy "Users read their own settings"
  on public.user_settings for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create their own settings"
  on public.user_settings for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own settings"
  on public.user_settings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

/* ------------------------------------------------------------ term sources */

-- Sources are the reader's list now, so the column can no longer be pinned to
-- the four the app shipped with. Everything already saved stays valid; what
-- changes is that "Textbook" or "Lecture" can be saved too. The column is
-- still `not null`, and the form still only offers names from the list above.
alter table public.terms drop constraint terms_source_check;

alter table public.terms
  add constraint terms_source_not_blank check (length(trim(source)) > 0);
