-- Brackets become one of the choices rather than a rule nobody can turn off.
--
-- A bracketed aside has been optional since flashcards were built: "to go (on
-- foot)" is answered by "to go". That is right for an aside saying when a word
-- applies, and wrong for a definition where the brackets are part of what the
-- answer is. Which one it is depends on how the reader writes their entries,
-- so it joins the other separators as something they choose.
--
-- The stored value gains `()` when brackets may be dropped. Two characters
-- rather than one so that a row reads as what it means; the application
-- recognises the choice by the opening bracket alone, so a row that somehow
-- carries only `(` still says the same thing.
--
-- Existing rows are given `()` rather than left as they are. The behaviour
-- they have today is brackets being optional, and this migration is meant to
-- add a choice, not to quietly take that away from anyone who has not asked.
--
-- The order below is the whole of the difficulty. The old constraint allows
-- four characters from `,/;|`, so the update has to happen after it is gone
-- and before its replacement arrives; doing it the obvious way round fails on
-- the first row it touches.

alter table public.user_settings
  drop constraint user_settings_answer_separators_sane;

update public.user_settings
set answer_separators = answer_separators || '()'
where position('(' in answer_separators) = 0;

alter table public.user_settings
  -- Six now rather than four: the four punctuation marks plus the pair.
  add constraint user_settings_answer_separators_sane
    check (answer_separators ~ '^[,/;|()]{0,6}$'),

  alter column answer_separators set default ',/()';

comment on column public.user_settings.answer_separators is
  'Characters that separate alternative answers when a flashcard is marked. '
  'Includes () when a bracketed aside may be left out of the answer.';
