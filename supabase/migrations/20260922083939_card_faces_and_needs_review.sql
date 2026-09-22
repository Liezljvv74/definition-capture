-- The two faces of a flashcard, and a way to mark something for review.
--
-- Two gaps the spine left. The deck builder offers "items marked as needing
-- review" as a filter, and nothing could set the flag, so the filter could
-- only ever match nothing. And a card has a front and a back, which is a
-- different question per content type: a word's back is its definition, a
-- phrase's is what it literally means, a verb's is its conjugations.
--
-- That per-type question is answered here rather than in the browser. It is a
-- property of the type, the type is defined in the database, and a fourth
-- content type should be able to become a flashcard by adding a branch to one
-- view rather than by finding the place in the application that knows how to
-- turn a row into a card.

/* --------------------------------------------------------- needs_review */

-- The column already exists on `learning_items`. The compatibility views did
-- not carry it, so the pages that read them could not show it or set it.
--
-- Appended at the end of each column list, not put where it reads best.
-- `create or replace view` may add columns and may not reorder or rename
-- them, so slotting it in beside `source` asks Postgres to rename every
-- column after it and it refuses, which is the right answer: a view's column
-- order is part of its contract with whatever selects from it.
create or replace view public.words with (security_invoker = true) as
  select
    i.id,
    i.user_id,
    i.title as word,
    d.definition,
    i.ref,
    i.source,
    i.created_at as date_added,
    i.updated_at as date_updated,
    coalesce(g.names, '{}'::text[]) as categories,
    i.needs_review
  from public.learning_items i
  join public.word_details d on d.id = i.id
  left join lateral (
    select array_agg(t.name order by t.name) as names
    from public.item_tags it
    join public.tags t on t.id = it.tag_id
    where it.item_id = i.id
  ) g on true
  where i.item_type = 'word';

create or replace view public.phrases with (security_invoker = true) as
  select
    i.id,
    i.user_id,
    i.title as phrase,
    d.literal_meaning,
    d.usage_example,
    i.ref,
    i.source,
    i.created_at,
    coalesce(g.names, '{}'::text[]) as categories,
    i.needs_review
  from public.learning_items i
  join public.phrase_details d on d.id = i.id
  left join lateral (
    select array_agg(t.name order by t.name) as names
    from public.item_tags it
    join public.tags t on t.id = it.tag_id
    where it.item_id = i.id
  ) g on true
  where i.item_type = 'phrase';

-- The triggers gain the same field. `coalesce` to the existing value on update
-- rather than to false, so a page that does not send the flag cannot clear it
-- by omission: the word form has no opinion about review and must not be able
-- to overwrite one.
create or replace function public.words_write() returns trigger
language plpgsql security invoker as $$
begin
  if tg_op = 'INSERT' then
    insert into public.learning_items
      (id, user_id, item_type, title, ref, source, needs_review, created_at, updated_at)
    values (
      coalesce(new.id, gen_random_uuid()),
      new.user_id, 'word', new.word,
      coalesce(new.ref, ''), coalesce(new.source, 'Manual'),
      coalesce(new.needs_review, false),
      coalesce(new.date_added, now()), new.date_updated
    )
    returning id into new.id;

    insert into public.word_details (id, definition)
    values (new.id, coalesce(new.definition, ''));
    perform public.set_item_categories(new.id, new.user_id, new.categories);
    return new;

  elsif tg_op = 'UPDATE' then
    update public.learning_items set
      title = new.word,
      ref = coalesce(new.ref, ''),
      source = coalesce(new.source, 'Manual'),
      needs_review = coalesce(new.needs_review, needs_review),
      updated_at = new.date_updated
    where id = old.id;

    update public.word_details set definition = coalesce(new.definition, '')
    where id = old.id;
    perform public.set_item_categories(old.id, old.user_id, new.categories);
    return new;

  else
    delete from public.learning_items where id = old.id;
    return old;
  end if;
end;
$$;

create or replace function public.phrases_write() returns trigger
language plpgsql security invoker as $$
begin
  if tg_op = 'INSERT' then
    insert into public.learning_items
      (id, user_id, item_type, title, ref, source, needs_review, created_at)
    values (
      coalesce(new.id, gen_random_uuid()),
      new.user_id, 'phrase', new.phrase,
      coalesce(new.ref, ''), coalesce(new.source, 'Manual'),
      coalesce(new.needs_review, false),
      coalesce(new.created_at, now())
    )
    returning id into new.id;

    insert into public.phrase_details (id, literal_meaning, usage_example)
    values (new.id, coalesce(new.literal_meaning, ''), coalesce(new.usage_example, ''));
    perform public.set_item_categories(new.id, new.user_id, new.categories);
    return new;

  elsif tg_op = 'UPDATE' then
    update public.learning_items set
      title = new.phrase,
      ref = coalesce(new.ref, ''),
      source = coalesce(new.source, 'Manual'),
      needs_review = coalesce(new.needs_review, needs_review),
      updated_at = now()
    where id = old.id;

    update public.phrase_details set
      literal_meaning = coalesce(new.literal_meaning, ''),
      usage_example = coalesce(new.usage_example, '')
    where id = old.id;
    perform public.set_item_categories(old.id, old.user_id, new.categories);
    return new;

  else
    delete from public.learning_items where id = old.id;
    return old;
  end if;
end;
$$;

/* ------------------------------------------------------------ card faces */

-- One row per item, already shaped as a card. The review screen then reads
-- one flat thing and renders it, rather than carrying a branch per type and
-- a second branch for every type added later.
--
-- A verb table's back is built here rather than sent as raw jsonb, because
-- the alternative is the browser reimplementing the padding rule that keeps
-- `conjugations[i]` lined up with `tenses[i]`. Rows the table does not have
-- are simply absent; a missing conjugation reads as blank.
create view public.card_faces with (security_invoker = true) as
  select
    i.id,
    i.user_id,
    i.item_type,
    i.needs_review,
    i.created_at,
    i.title as front,
    case i.item_type
      when 'word' then w.definition
      when 'phrase' then nullif(
        concat_ws(
          E'\n\n',
          nullif(p.literal_meaning, ''),
          nullif(p.usage_example, '')
        ), '')
      when 'verb_table' then (
        select string_agg(line, E'\n')
        from (
          select format(
                   '%s: %s',
                   r.value ->> 'person',
                   coalesce(
                     nullif(
                       (select string_agg(
                                 format('%s %s', v.tense, coalesce(v.conjugation, '')),
                                 '  ·  ' order by v.at)
                        from (
                          select t.ordinality as at,
                                 t.tense,
                                 (r.value -> 'conjugations' ->> (t.ordinality - 1)::int) as conjugation
                          from unnest(vt.tenses) with ordinality as t(tense, ordinality)
                        ) v
                        where coalesce(v.conjugation, '') <> ''),
                       ''),
                     '—')
                 ) as line
          from jsonb_array_elements(vt.rows) as r(value)
        ) as lines
      )
    end as back
  from public.learning_items i
  left join public.word_details w on w.id = i.id
  left join public.phrase_details p on p.id = i.id
  left join public.verb_table_details vt on vt.id = i.id;

comment on view public.card_faces is
  'Every item as a flashcard front and back. A new content type adds a branch here.';
