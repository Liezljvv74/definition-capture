-- Which tense a conjugation table is for — present, past, future, whatever
-- the language and the reader call them.
--
-- The tense sits on the table rather than on each row: every row in a table
-- is the same tense, and the reader is asked once when the table is made.
--
-- Existing tables get '', which reads as "not said". They were made before
-- the question existed and nothing should invent an answer on their behalf.

alter table public.verb_tables
  add column tense text not null default '';

comment on column public.verb_tables.tense is
  'The tense this table conjugates for. Empty on tables made before it was asked.';

-- The answers themselves are remembered, so the second table offers a list
-- rather than asking the reader to type "present" again. Same shape as the
-- persons list beside it.
alter table public.user_settings
  add column verb_tenses text[] not null default '{}',

  add constraint user_settings_verb_tenses_sane
    check (coalesce(array_length(verb_tenses, 1), 0) <= 30),

  add constraint user_settings_verb_tenses_not_blank
    check (not ('' = any (verb_tenses)));

comment on column public.user_settings.verb_tenses is
  'Tenses offered when making a table. Grows as new ones are typed.';
