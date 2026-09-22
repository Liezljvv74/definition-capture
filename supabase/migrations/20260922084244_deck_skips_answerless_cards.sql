-- A card with nothing on its back is not a card.
--
-- The builder drew from `learning_items`, which includes a word saved without
-- its definition yet. That is a perfectly good word and a useless flashcard:
-- it can be turned over to reveal nothing, and there is no answer to be right
-- or wrong about. One of the words in this account is already in that state,
-- which is how it was noticed.
--
-- Drawing from `card_faces` instead puts the rule with the definition of what
-- a face is, so a content type added later inherits it rather than having to
-- remember it. The rest of the function is unchanged.

create or replace function public.build_flashcard_deck(
  sources text[] default '{}',
  category_ids uuid[] default '{}',
  only_needs_review boolean default false,
  only_recent boolean default false,
  size integer default 50,
  deck_name text default ''
) returns uuid
language plpgsql security invoker as $$
declare
  owner uuid := auth.uid();
  deck uuid;
begin
  if owner is null then
    raise exception 'not signed in';
  end if;

  insert into public.flashcard_decks
    (user_id, name, source_types, requested_size, filters)
  values (
    owner, deck_name, coalesce(sources, '{}'), greatest(1, least(500, size)),
    jsonb_build_object(
      'category_ids', to_jsonb(coalesce(category_ids, '{}')),
      'needs_review', only_needs_review,
      'most_recent', only_recent
    )
  )
  returning id into deck;

  insert into public.deck_items (deck_id, item_id, position)
  select deck, candidate.id, row_number() over ()
  from (
    select c.id
    from public.card_faces c
    where c.user_id = owner
      and coalesce(c.back, '') <> ''
      and (cardinality(coalesce(sources, '{}')) = 0 or c.item_type = any(sources))
      and (not only_needs_review or c.needs_review)
      and (
        cardinality(coalesce(category_ids, '{}')) = 0
        or exists (
          select 1 from public.item_tags it
          where it.item_id = c.id and it.tag_id = any(category_ids)
        )
      )
    order by
      case when only_recent then c.created_at end desc nulls last,
      case when only_recent then null else
        coalesce(
          (select p.due_at from public.progress_summary p where p.item_id = c.id),
          'epoch'::timestamptz
        )
      end asc,
      random()
    limit greatest(1, least(500, size))
  ) as candidate;

  return deck;
end;
$$;
