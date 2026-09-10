-- Removes the `meanings` columns.
--
-- They were added so one term could carry several senses, and that feature
-- was reverted before it was committed. The columns outlived it because the
-- migration had already been pushed, leaving the database a step ahead of the
-- code. This puts the two back in line.
--
-- `if exists` because the migration that added these columns is not in this
-- repository — it was reverted along with the rest of the feature. A database
-- built from these files alone never had them, and must not fail here.
--
-- The check constraints go with their columns; naming them separately would
-- only be another thing to keep in step.

alter table public.terms drop column if exists meanings;

alter table public.phrases drop column if exists meanings;
