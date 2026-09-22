-- The pre-spine tables go.
--
-- `words`, `phrases` and `verb_tables` were renamed to `*_legacy` when
-- `learning_items` took over, so that the backfill could be checked against
-- what it was built from and undone if it had gone wrong. It did not: the
-- copy was verified field by field at the time, the application has been
-- reading and writing through the views since, and their privileges were
-- revoked from `anon` and `authenticated` earlier today. What is left is a
-- second copy of every row that nothing maintains, which is worse than no
-- copy: it looks like data while drifting further from the truth by the day.
--
-- This cannot be undone, so it checks before it acts. Every row in an old
-- table must still have its counterpart in `learning_items`, matched by the
-- id it kept through the migration. Anything unaccounted for aborts the whole
-- transaction and says how many, and nothing is dropped.
--
-- Fields are deliberately not compared. They are allowed to differ by now:
-- an entry edited since the cutover has a newer title, definition or ref in
-- the spine and its old wording in the legacy row, and that is the spine
-- being right rather than a discrepancy. What no amount of ordinary use may
-- do is make a row disappear, which is the only thing dropping these tables
-- could cost.

do $$
declare
  missing_words integer;
  missing_phrases integer;
  missing_tables integer;
begin
  select count(*) into missing_words
  from public.words_legacy w
  where not exists (
    select 1 from public.learning_items i
    where i.id = w.id and i.item_type = 'word'
  );

  select count(*) into missing_phrases
  from public.phrases_legacy p
  where not exists (
    select 1 from public.learning_items i
    where i.id = p.id and i.item_type = 'phrase'
  );

  select count(*) into missing_tables
  from public.verb_tables_legacy v
  where not exists (
    select 1 from public.learning_items i
    where i.id = v.id and i.item_type = 'verb_table'
  );

  if missing_words + missing_phrases + missing_tables > 0 then
    raise exception
      'Not dropping anything: % words, % phrases and % verb tables in the old '
      'tables have no row in learning_items. Find out why before running this.',
      missing_words, missing_phrases, missing_tables;
  end if;

  raise notice
    'Legacy rows all accounted for: % words, % phrases, % verb tables.',
    (select count(*) from public.words_legacy),
    (select count(*) from public.phrases_legacy),
    (select count(*) from public.verb_tables_legacy);
end;
$$;

drop table public.words_legacy;
drop table public.phrases_legacy;
drop table public.verb_tables_legacy;
