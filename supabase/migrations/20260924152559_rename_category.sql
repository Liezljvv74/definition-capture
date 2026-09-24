-- Renaming a category, everywhere it is used.
--
-- A category is two things: a name in `user_settings.categories`, which the
-- forms offer, and a row in `tags`, which every word and phrase filed under it
-- points at through `item_tags` and which the flashcard filter reads.
-- Renaming only the first would leave every item still carrying the old name,
-- and `sync_category_tags` would then keep the old tag alive because things
-- are filed under it. So a rename is done here, on the tag, and every item
-- follows because the views read the name through the tag rather than
-- holding a copy of it.
--
-- The new name may already have a tag of its own: a category taken off the
-- Settings list while things were still filed under it keeps its tag, and
-- `tags` allows one spelling of a name per reader. A rename onto it is then a
-- merge, which is what somebody renaming "Meal" to "Food" means: everything
-- filed under either is filed under Food, once.
--
-- The Settings list itself is saved by the application afterwards, through
-- `saveSettings`, which keeps its own ordering and validation in one place.
-- That save calls `sync_category_tags`, which finds the renamed tag already
-- there and only sets its position.

create or replace function public.rename_category(from_name text, to_name text)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  owner uuid := auth.uid();
  wanted text := trim(coalesce(to_name, ''));
  source uuid;
  target uuid;
begin
  if owner is null then
    raise exception 'not signed in';
  end if;
  if wanted = '' then
    raise exception 'a category needs a name';
  end if;

  select t.id into source
  from public.tags t
  where t.user_id = owner and t.kind = 'category'
    and lower(t.name) = lower(trim(coalesce(from_name, '')));

  -- A name on the Settings list that nothing has been filed under may have
  -- no tag yet. There is nothing to carry across; saving the list makes it.
  if source is null then
    return;
  end if;

  select t.id into target
  from public.tags t
  where t.user_id = owner and t.kind = 'category'
    and lower(t.name) = lower(wanted) and t.id <> source;

  if target is null then
    -- Also the path for a change of case alone, "food" to "Food", which the
    -- unique index sees as the same name and this sees as the same tag.
    update public.tags set name = wanted where id = source;
  else
    insert into public.item_tags (item_id, tag_id)
    select it.item_id, target
    from public.item_tags it
    where it.tag_id = source
    on conflict do nothing;

    -- `item_tags` cascades, so the old links go with it.
    delete from public.tags where id = source;
  end if;
end;
$$;

-- Signed-in callers only, like every other function here; see
-- `20260924112126_security_audit_findings`.
revoke execute on function public.rename_category(text, text) from public, anon;
grant execute on function public.rename_category(text, text) to authenticated;
