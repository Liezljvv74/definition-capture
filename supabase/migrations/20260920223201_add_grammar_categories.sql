-- A second list of categories, for grammar rules.
--
-- Grammar rules shipped with a free-text category and a datalist built from
-- whatever was already in use. That works, but it is the only list in the app
-- whose groups are not editable in Settings, and it gives no way to plan a set
-- of groups before there are rules to put in them.
--
-- A separate column rather than sharing `categories` with the terms. The two
-- vocabularies have nothing to do with each other — a term is filed under
-- Food or Travel, a rule under Cases or Word order — and one shared list would
-- offer every term category on the grammar form and every grammar category on
-- the term form.
--
-- Same shape as `verb_persons` and `verb_tenses`: a text[] on the settings
-- row, capped, with no blank members. Empty means "nothing chosen yet", and
-- the app falls back to the defaults in `constants.ts` for that case, which is
-- how `categories` already behaves.

alter table public.user_settings
  add column grammar_categories text[] not null default '{}',

  add constraint user_settings_grammar_categories_sane
    check (coalesce(array_length(grammar_categories, 1), 0) <= 30),

  add constraint user_settings_grammar_categories_not_blank
    check (not ('' = any (grammar_categories)));

comment on column public.user_settings.grammar_categories is
  'The groups a grammar rule can be filed under. Separate from the term categories.';
