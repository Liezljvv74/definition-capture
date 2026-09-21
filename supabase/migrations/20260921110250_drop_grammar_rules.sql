-- The grammar rules are gone, and so is the page that showed them.
--
-- The app is back to three lists: terms, phrases and conjugation tables. This
-- undoes `20260920214501_add_grammar_rules.sql` and the settings column added
-- by `20260920223201_add_grammar_categories.sql`. Neither is written or read
-- by any code that remains, so leaving them would be a table nothing can
-- reach and a column nothing can set.
--
-- This deletes rows. Every grammar rule saved under every account goes with
-- the table, and no part of the app can put them back, so anyone who wants to
-- keep theirs needs a Backup export taken before this runs. There is no
-- halfway version worth writing: a table kept "just in case" would sit behind
-- row level security with no reader, and the next person to look would have
-- no way of telling whether it was live.
--
-- Dropping the table takes its indexes and its four policies with it, which
-- is why they are not named here. The column drop takes its two check
-- constraints the same way.

drop table if exists public.grammar_rules;

alter table public.user_settings
  drop column if exists grammar_categories;
