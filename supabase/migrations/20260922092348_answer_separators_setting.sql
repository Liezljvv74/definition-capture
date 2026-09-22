-- Which characters separate one acceptable answer from the next, per account.
--
-- A flashcard is marked by comparing what was typed with the back of the card,
-- and a glossary entry like "gladly, willingly" offers two answers rather than
-- one. Which punctuation means "or" rather than "and" is a matter of how the
-- reader writes their own entries, so it belongs with the rest of what they
-- have chosen and not in a constant somebody has to edit.
--
-- A string of characters rather than a `text[]`, because that is what it is:
-- the set of separator characters, four at most. The application offers a
-- fixed set of candidates rather than a free text box, and the check
-- constraint below is the same rule stated where it cannot be bypassed.
--
-- Empty is a real and useful answer. It means no character separates
-- anything, so "gladly, willingly" is one answer that has to be typed out.

alter table public.user_settings
  add column answer_separators text not null default ',/',

  -- Only punctuation that could plausibly mean "or", and only a few of it.
  -- The reason this is a constraint and not merely a form validation: a
  -- letter in here would split every answer containing that letter, and
  -- marking would quietly stop working in a way nobody would connect to a
  -- settings change made weeks earlier.
  add constraint user_settings_answer_separators_sane
    check (answer_separators ~ '^[,/;|]{0,4}$');

comment on column public.user_settings.answer_separators is
  'Characters that separate alternative answers when a flashcard is marked.';
