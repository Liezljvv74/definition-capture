-- Categories on phrases, the same way terms have carried them since
-- `20260910145042_add_term_categories.sql`. Up to three per phrase.
--
-- The same list as the terms, not a second one. Terms and phrases are the two
-- halves of the Glossary tab, and the setting that feeds them is now called
-- Glossary Categories precisely because it covers both. A phrase about food
-- belongs under Food for the same reason a term does. Grammar rules are the
-- ones that needed their own vocabulary, and they have it.
--
-- Everything else here mirrors the terms column deliberately: a text array
-- rather than a join table, because the whole list is already in the browser
-- and filtered there; the cap and the blank check repeated in the database,
-- because the browser holds the only other copy of those rules and a second
-- tab must not be able to slip past them; and `not null default '{}'` so every
-- existing phrase reads as "no categories" rather than null.

alter table public.phrases
  add column categories text[] not null default '{}',

  add constraint phrases_categories_max_three
    check (coalesce(array_length(categories, 1), 0) <= 3),

  add constraint phrases_categories_no_blanks
    check (not ('' = any (categories)));

comment on column public.phrases.categories is
  'Up to three group names, shared with the terms. Filtered in the browser.';
