-- `terms` is renamed to `words`, and its `term` column to `word`, to match
-- what the app now calls these rows: the page is Vocabulary and the column is
-- Word. This is the same move `20260910123400_rename_entries_to_terms.sql`
-- made when `entries` became `terms`, and it is written the same way.
--
-- A rename keeps the rows, the data and the grants, and costs nothing: it
-- rewrites catalogue entries rather than the table. What it does not do is
-- rename the objects hanging off the table. Indexes, constraints and policies
-- would all keep their `terms_*` names, so they are renamed too rather than
-- leaving the schema half-named for the next person who reads it.
--
-- `terms_source_check` is deliberately absent below: it was dropped in
-- `20260910160828_add_user_settings.sql` and replaced by
-- `terms_source_not_blank`, so renaming it here would fail.
--
-- This has to be applied together with the code that reads `words.word`.
-- Between the two, every read of the list fails.

alter table public.terms rename to words;
alter table public.words rename column term to word;

-- The constraints, including the one that owns the primary key.
alter table public.words rename constraint terms_pkey to words_pkey;
alter table public.words rename constraint terms_user_id_fkey to words_user_id_fkey;
alter table public.words rename constraint terms_term_check to words_word_check;
alter table public.words rename constraint terms_source_not_blank to words_source_not_blank;
alter table public.words
  rename constraint terms_categories_max_three to words_categories_max_three;
alter table public.words
  rename constraint terms_categories_no_blanks to words_categories_no_blanks;

-- The indexes. `terms_user_term_key` is on `(user_id, lower(term))`, and the
-- column rename above already carried its definition across, so only the name
-- is left to fix.
alter index public.terms_user_term_key rename to words_user_word_key;
alter index public.terms_user_date_added_idx rename to words_user_date_added_idx;

-- Row level security is still the only thing separating one account's
-- vocabulary from another's, so these are renamed rather than dropped and
-- recreated: there is no window in which the table sits unprotected.
alter policy "Users read their own terms" on public.words
  rename to "Users read their own words";
alter policy "Users create their own terms" on public.words
  rename to "Users create their own words";
alter policy "Users update their own terms" on public.words
  rename to "Users update their own words";
alter policy "Users delete their own terms" on public.words
  rename to "Users delete their own words";

comment on column public.words.categories is
  'Up to three group names, shared with the phrases. Filtered in the browser.';
