-- Renaming a source, on everything that names it.
--
-- A source is a name in `user_settings.sources`, which the forms offer, and a
-- copy of that name in `learning_items.source` on every word and phrase that
-- came from it. Unlike a category there is no table of sources for the items
-- to point at, so a rename has to rewrite the copies, or every word would go
-- on showing the old name. `rename_category` is the same idea for categories,
-- where the rename happens on the one tag instead.
--
-- Matched without regard to case, the way the app compares every name, so a
-- word saved as "google" before the list said "Google" is renamed with it.
-- `updated_at` is left alone: the words themselves have not been edited, and
-- the date shown as last changed should still say when they were.
--
-- The Settings list is saved by the application afterwards, as it is for a
-- category rename.

create or replace function public.rename_source(from_name text, to_name text)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  owner uuid := auth.uid();
  wanted text := trim(coalesce(to_name, ''));
begin
  if owner is null then
    raise exception 'not signed in';
  end if;
  if wanted = '' then
    raise exception 'a source needs a name';
  end if;

  update public.learning_items
  set source = wanted
  where user_id = owner
    and lower(source) = lower(trim(coalesce(from_name, '')));
end;
$$;

-- Signed-in callers only; see `20260924112126_security_audit_findings`.
revoke execute on function public.rename_source(text, text) from public, anon;
grant execute on function public.rename_source(text, text) to authenticated;
