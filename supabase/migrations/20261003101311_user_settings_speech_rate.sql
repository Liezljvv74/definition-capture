-- How fast the read-aloud buttons speak; see Docs/voice.md. A plain column on
-- the one settings row, so the existing RLS policies on user_settings cover it.
alter table public.user_settings
  add column speech_rate text not null default 'normal'
  check (speech_rate in ('slow', 'normal', 'fast'));
