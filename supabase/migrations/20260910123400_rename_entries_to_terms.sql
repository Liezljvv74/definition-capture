-- `entries` is renamed to `terms`, to match what the app has always called
-- these rows in its interface. Phrases keep their own table; this touches only
-- the glossary side.
--
-- A rename keeps the rows, the data and the grants, but it does *not* rename
-- the objects hanging off the table: indexes, constraints and policies would
-- all keep their `entries_*` names. Those are renamed too, so the schema does
-- not end up half-named after the next person reads it.

alter table public.entries rename to terms;

-- Indexes and the constraints that own them.
alter table public.terms rename constraint entries_pkey to terms_pkey;
alter table public.terms rename constraint entries_user_id_fkey to terms_user_id_fkey;
alter table public.terms rename constraint entries_term_check to terms_term_check;
alter table public.terms rename constraint entries_source_check to terms_source_check;

alter index public.entries_user_term_key rename to terms_user_term_key;
alter index public.entries_user_date_added_idx rename to terms_user_date_added_idx;

-- Row level security is still the only thing separating one user's glossary
-- from another's, so these policies are renamed rather than dropped and
-- recreated: there is no window in which the table sits unprotected.
alter policy "Users read their own entries" on public.terms
  rename to "Users read their own terms";
alter policy "Users create their own entries" on public.terms
  rename to "Users create their own terms";
alter policy "Users update their own entries" on public.terms
  rename to "Users update their own terms";
alter policy "Users delete their own entries" on public.terms
  rename to "Users delete their own terms";
