-- Categories group terms that belong together — Nature, Home, Careers, and so
-- on. A term may carry up to three of them.
--
-- A text array rather than a join table: the whole list is already fetched
-- into the browser and filtered there, so a second table would add a join and
-- a second round trip to answer a question the client can answer from memory.
-- The cap and the blank check live here anyway, because the browser holds the
-- only other copy of these rules and a second tab must not be able to slip
-- past them.
--
-- `not null default '{}'` means every existing row reads as "no categories"
-- rather than null, so nothing downstream has to test for both.

alter table public.terms
  add column categories text[] not null default '{}',

  add constraint terms_categories_max_three
    check (coalesce(array_length(categories, 1), 0) <= 3),

  -- `= any(...)` rather than a subquery: a check constraint cannot contain
  -- one. This catches the empty string a form could otherwise submit; the
  -- client trims before saving, so whitespace-only names never get this far.
  add constraint terms_categories_no_blanks
    check (not ('' = any (categories)));

comment on column public.terms.categories is
  'Up to three group names, e.g. Nature or Office. Filtered in the browser.';
