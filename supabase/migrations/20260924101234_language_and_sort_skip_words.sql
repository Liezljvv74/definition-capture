-- The language being learned, and the words Vocabulary sorts past.
--
-- Sorting used to be German and fixed: the lists were collated in German, and
-- Vocabulary looked past a leading der, die, das or ein. Both are now the
-- reader's to set. The language sets the alphabetical order of every list,
-- and the skip list says which leading words, usually articles, a word is
-- sorted without. See `src/lib/sortName.ts`.
--
-- The language is an ISO 639-1 code rather than a name. A name depends on the
-- language it is written in, and the code is what the browser's collator
-- takes. A language the menu does not have is typed in by name instead, into
-- its own column, and the two are one answer: the constraint below refuses a
-- row holding both, which could not say which one it meant.
--
-- Existing rows get no language and an empty list, the same as a new account.
-- The app ships without assuming a language, so the German rule is not
-- carried forward on anyone's behalf; the reader chooses German once in
-- Settings to have it back. The alphabetical order does not change for them in
-- the meantime, since German collation is the default order.
--
-- No policy changes: these are columns on a row that row level security
-- already restricts to its owner, for every operation.

alter table public.user_settings
  add column language text not null default '',
  add column language_other text not null default '',
  add column sort_skip_words text[] not null default '{}',

  add constraint user_settings_language_code
    check (language ~ '^([a-z]{2,3})?$'),

  add constraint user_settings_language_other_sane
    check (length(language_other) <= 60 and language_other = btrim(language_other)),

  add constraint user_settings_one_language
    check (language = '' or language_other = ''),

  -- The same guards as the other lists. The total length stands in for a
  -- per-word limit, which a check constraint cannot express without a
  -- subquery: thirty words of twenty characters at most.
  add constraint user_settings_sort_skip_words_sane
    check (coalesce(array_length(sort_skip_words, 1), 0) <= 30),
  add constraint user_settings_sort_skip_words_not_blank
    check (not ('' = any (sort_skip_words))),
  add constraint user_settings_sort_skip_words_short
    check (length(array_to_string(sort_skip_words, '')) <= 600);

comment on column public.user_settings.language is
  'ISO 639-1 code of the language being learned, or empty. Sets the collation of every list.';
comment on column public.user_settings.language_other is
  'Name of a language the menu does not offer, typed in by hand. Only set while language is empty.';
comment on column public.user_settings.sort_skip_words is
  'Leading words, usually articles, that Vocabulary sorts past.';
