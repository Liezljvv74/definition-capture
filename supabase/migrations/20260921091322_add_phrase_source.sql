-- Where a phrase came from, exactly as terms have recorded it since the first
-- migration: free text, defaulting to Manual.
--
-- Free text rather than a check constraint on four names. The terms column
-- began that way and `20260910160828_add_user_settings.sql` dropped the
-- constraint when sources became a per-account list, so a new column with the
-- old enum on it would be a step backwards. `readSource` in the app supplies
-- the default for anything blank or unreadable.
--
-- `not null default 'Manual'` means every phrase already saved reads as Manual
-- rather than null, which is true: they were all typed in by hand.

alter table public.phrases
  add column source text not null default 'Manual';

comment on column public.phrases.source is
  'Where the phrase came from. The reader''s own list, held in user_settings.';
