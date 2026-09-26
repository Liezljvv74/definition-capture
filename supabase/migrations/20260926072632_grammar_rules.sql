-- Grammar rules: a fourth kind of item, and topics, a second tag context.
-- `Docs/grammar.md` is the design; this is its Data section.
--
-- Additive. Nothing the app reads today changes shape, so the app keeps
-- working between this push and the deploy that starts writing rules.

/* --------------------------------------------------- the fourth item type */

alter table public.items drop constraint items_item_type_check;
alter table public.items add constraint items_item_type_check
  check (item_type in ('word', 'phrase', 'verb_table', 'grammar'));

-- A rule's content is an ordered array of blocks, read and written whole,
-- which is what jsonb is for; a new block type is a new shape in the array,
-- not a column. `map_x` and `map_y` are where the rule sits on the map,
-- unset until it has been placed (stage 4 of the design).
alter table public.items
  add column blocks jsonb,
  add column map_x real,
  add column map_y real,
  add constraint items_grammar_fields check ((item_type = 'grammar') = (blocks is not null)),
  add constraint items_blocks_limit check (
    blocks is null
    or (jsonb_typeof(blocks) = 'array' and jsonb_array_length(blocks) <= 200)),
  add constraint items_map_only_grammar check (
    item_type = 'grammar' or (map_x is null and map_y is null)),
  -- A rule has no source, for the reason a verb table has none: Settings
  -- counts a source's uses from words and phrases only.
  add constraint items_grammar_no_source check (item_type <> 'grammar' or source_id is null);

-- `has_answer` has no branch for grammar and falls to `else false`. That is
-- deliberate: rules make no flashcards. `build_deck` and the deck dialog only
-- ever draw from items with an answer, so rules stay out of decks without
-- anything more being said.

/* -------------------------------------------------------- the topic context */

-- Topics are tags in their own context: a rule has exactly one, and the list
-- is separate from collections. The check keeps a rule to at most one;
-- `save_items` refuses a rule with none.
alter table public.tags drop constraint tags_context_check;
alter table public.tags add constraint tags_context_check
  check (context in ('collection', 'grammar'));

alter table public.item_tags add constraint item_tags_grammar_one
  check (context <> 'grammar' or position = 1);

/* ---------------------------------------------- moving a node is not an edit */

create or replace function public.set_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.updated_at is distinct from old.updated_at then
    return new;
  end if;
  -- Dragging a rule on the map changes `map_x` and `map_y` and nothing the
  -- reader wrote, so it joins the columns that do not count as an edit.
  if (to_jsonb(new) - array['updated_at', 'needs_review', 'source_id', 'has_answer', 'map_x', 'map_y'])
     is distinct from
     (to_jsonb(old) - array['updated_at', 'needs_review', 'source_id', 'has_answer', 'map_x', 'map_y']) then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

/* ----------------------------------------------- save_items learns rules */

-- The body of `refactor_build_new_schema` with the grammar columns declared
-- and the topic resolved, the way a source is: by name, created if missing.
-- `create or replace` keeps the grants. A key absent from the payload leaves
-- that part of an existing item alone, as before; `map_x` and `map_y` are
-- absent from every save the rule editor makes and present only from the map.
create or replace function public.save_items(payload jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  owner uuid := auth.uid();
begin
  if owner is null then
    raise exception 'not signed in';
  end if;
  if jsonb_typeof(payload) is distinct from 'array' then
    raise exception 'save_items takes an array of items';
  end if;
  if exists (select 1 from jsonb_array_elements(payload) e where e ->> 'id' is null) then
    raise exception 'every item needs an id';
  end if;
  -- A rule sent with a blank topic, or a new rule sent without one, has no
  -- topic to be filed under; the check on `item_tags` holds it to one.
  if exists (
    select 1 from jsonb_array_elements(payload) e
    where e ->> 'item_type' = 'grammar'
      and btrim(coalesce(e ->> 'topic', '')) = ''
      and (e ? 'topic' or not exists (
        select 1 from public.item_tags it
        where it.item_id = (e ->> 'id')::uuid and it.context = 'grammar'))
  ) then
    raise exception 'a rule needs a topic';
  end if;

  insert into public.sources (user_id, name)
  select distinct on (lower(btrim(e ->> 'source'))) owner, btrim(e ->> 'source')
  from jsonb_array_elements(payload) e
  where btrim(coalesce(e ->> 'source', '')) <> ''
    and e ->> 'item_type' not in ('verb_table', 'grammar')
  order by lower(btrim(e ->> 'source'))
  on conflict (user_id, lower(name)) do nothing;

  with s as (
    select * from jsonb_to_recordset(payload) as x(
      id uuid, item_type text, title text, ref text, source text,
      needs_review boolean, definition text, literal_meaning text,
      usage_example text, tenses text[], verb_rows jsonb, blocks jsonb,
      map_x real, map_y real, created_at timestamptz, updated_at timestamptz)
  ), shaped as (
    select
      s.id, s.item_type, btrim(coalesce(s.title, '')) as title,
      coalesce(s.ref, '') as ref, s.needs_review, s.created_at, s.updated_at,
      s.map_x, s.map_y,
      s.source is not null and s.item_type not in ('verb_table', 'grammar') as has_source,
      case when s.item_type not in ('verb_table', 'grammar') then (
        select src.id from public.sources src
        where src.user_id = owner and lower(src.name) = lower(btrim(s.source))) end as source_id,
      case when s.item_type = 'word' then coalesce(s.definition, '') end as definition,
      case when s.item_type = 'phrase' then coalesce(s.literal_meaning, '') end as literal_meaning,
      case when s.item_type = 'phrase' then coalesce(s.usage_example, '') end as usage_example,
      case when s.item_type = 'verb_table' then coalesce(s.tenses, '{}') end as tenses,
      case when s.item_type = 'verb_table' then coalesce(s.verb_rows, '[]') end as verb_rows,
      case when s.item_type = 'grammar' then coalesce(s.blocks, '[]') end as blocks
    from s
  ), updated as (
    update public.items i set
      item_type = sh.item_type,
      title = sh.title,
      ref = sh.ref,
      source_id = case when sh.has_source then sh.source_id else i.source_id end,
      needs_review = coalesce(sh.needs_review, i.needs_review),
      updated_at = coalesce(sh.updated_at, i.updated_at),
      definition = sh.definition,
      literal_meaning = sh.literal_meaning,
      usage_example = sh.usage_example,
      tenses = sh.tenses,
      verb_rows = sh.verb_rows,
      blocks = sh.blocks,
      map_x = coalesce(sh.map_x, i.map_x),
      map_y = coalesce(sh.map_y, i.map_y)
    from shaped sh
    where i.id = sh.id
    returning i.id
  )
  insert into public.items
    (id, user_id, item_type, title, ref, source_id, needs_review, created_at,
     updated_at, definition, literal_meaning, usage_example, tenses, verb_rows,
     blocks, map_x, map_y)
  select
    sh.id, owner, sh.item_type, sh.title, sh.ref, sh.source_id,
    coalesce(sh.needs_review, false), coalesce(sh.created_at, now()),
    coalesce(sh.updated_at, sh.created_at, now()),
    sh.definition, sh.literal_meaning, sh.usage_example, sh.tenses, sh.verb_rows,
    sh.blocks, sh.map_x, sh.map_y
  from shaped sh
  where not exists (select 1 from updated u where u.id = sh.id);

  -- Collections, unchanged from before.
  insert into public.tags (user_id, context, name)
  select distinct on (lower(btrim(n))) owner, 'collection', btrim(n)
  from jsonb_array_elements(payload) e,
       jsonb_array_elements_text(
         case when jsonb_typeof(e -> 'collections') = 'array' then e -> 'collections' end) n
  where btrim(n) <> ''
  order by lower(btrim(n))
  on conflict (user_id, context, lower(name)) do nothing;

  delete from public.item_tags it
  using jsonb_array_elements(payload) e
  where jsonb_typeof(e -> 'collections') = 'array'
    and it.item_id = (e ->> 'id')::uuid
    and it.context = 'collection';

  insert into public.item_tags (item_id, tag_id, user_id, context, position)
  select item_id, tag_id, owner, 'collection',
         row_number() over (partition by item_id order by first_at)
  from (
    select (e ->> 'id')::uuid as item_id, t.id as tag_id, min(n.at) as first_at
    from jsonb_array_elements(payload) e,
         jsonb_array_elements_text(
           case when jsonb_typeof(e -> 'collections') = 'array' then e -> 'collections' end)
           with ordinality as n(name, at)
    join public.tags t
      on t.user_id = owner and t.context = 'collection'
     and lower(t.name) = lower(btrim(n.name))
    where jsonb_typeof(e -> 'collections') = 'array'
    group by 1, 2
  ) picked;

  -- Topics, for the rules that sent a `topic`: one name, one link.
  insert into public.tags (user_id, context, name)
  select distinct on (lower(btrim(e ->> 'topic'))) owner, 'grammar', btrim(e ->> 'topic')
  from jsonb_array_elements(payload) e
  where e ->> 'item_type' = 'grammar' and btrim(coalesce(e ->> 'topic', '')) <> ''
  order by lower(btrim(e ->> 'topic'))
  on conflict (user_id, context, lower(name)) do nothing;

  delete from public.item_tags it
  using jsonb_array_elements(payload) e
  where e ->> 'item_type' = 'grammar' and e ? 'topic'
    and it.item_id = (e ->> 'id')::uuid
    and it.context = 'grammar';

  insert into public.item_tags (item_id, tag_id, user_id, context, position)
  select (e ->> 'id')::uuid, t.id, owner, 'grammar', 1
  from jsonb_array_elements(payload) e
  join public.tags t
    on t.user_id = owner and t.context = 'grammar'
   and lower(t.name) = lower(btrim(e ->> 'topic'))
  where e ->> 'item_type' = 'grammar' and btrim(coalesce(e ->> 'topic', '')) <> '';
end;
$$;

/* ---------------------------------------------------------- the proof */

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'items_grammar_fields')
     or not exists (select 1 from pg_constraint where conname = 'item_tags_grammar_one')
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'items' and column_name = 'blocks') then
    raise exception 'the grammar columns or checks did not land';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_updated_at' and p.prosrc like '%map_x%'
  ) then
    raise exception 'set_updated_at does not exclude the map position';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('save_items', 'set_updated_at')
      and (p.prosecdef or p.proconfig is distinct from array['search_path=""'])
  ) then
    raise exception 'a replaced function lost its security settings';
  end if;
end;
$$;
