-- The glossary and phrase list, one private copy per signed-in user.
--
-- This app is a static export served from GitHub Pages, so every query runs in
-- the browser under the publishable key. There is no server to hide a secret
-- in, which makes the row level security policies below the *only* thing
-- separating one user's glossary from another's. Never disable them.

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  term text not null check (length(trim(term)) > 0),
  -- Empty is a legitimate state: an entry captured now and defined later is
  -- what the app calls "needs definition". That flag is always recomputed from
  -- this column in the client, so it is deliberately not stored.
  definition text not null default '',
  ref text not null default '',
  source text not null default 'Manual'
    check (source in ('Manual', 'Google', 'Claude', 'ChatGPT')),
  -- Set once at creation and never touched by an edit.
  date_added timestamptz not null default now(),
  date_updated timestamptz
);

-- Phrases are deliberately date-free in the UI: they are looked up by wording,
-- not by when they were captured. `created_at` exists only so the list can keep
-- the "newest first" order that array order gave it in localStorage.
create table public.phrases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  phrase text not null check (length(trim(phrase)) > 0),
  literal_meaning text not null default '',
  usage_example text not null default '',
  ref text not null default '',
  created_at timestamptz not null default now()
);

-- The duplicate check the add and edit forms perform, enforced in the database
-- so a second tab or a stale client cannot slip a duplicate past it. Scoped per
-- user: two people may each keep their own entry for the same term.
create unique index entries_user_term_key on public.entries (user_id, lower(term));
create unique index phrases_user_phrase_key on public.phrases (user_id, lower(phrase));

-- Every list query filters by owner and sorts by date, so index the pair.
create index entries_user_date_added_idx on public.entries (user_id, date_added desc);
create index phrases_user_created_at_idx on public.phrases (user_id, created_at desc);

/* ------------------------------------------------------ row level security */

alter table public.entries enable row level security;
alter table public.phrases enable row level security;

-- `(select auth.uid())` rather than a bare `auth.uid()`: wrapping it lets
-- Postgres evaluate the current user once per statement instead of once per
-- row, which is the difference between a fast and a slow list query.
-- `with check` on insert and update stops a client handing over someone
-- else's user_id.

create policy "Users read their own entries"
  on public.entries for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create their own entries"
  on public.entries for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own entries"
  on public.entries for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own entries"
  on public.entries for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read their own phrases"
  on public.phrases for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users create their own phrases"
  on public.phrases for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users update their own phrases"
  on public.phrases for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users delete their own phrases"
  on public.phrases for delete to authenticated
  using ((select auth.uid()) = user_id);
