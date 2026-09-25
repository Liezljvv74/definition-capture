-- Step 3 of the database refactor in `Docs/db-refactor-plan.md`: drop the
-- old schema, now that the app reads and writes only the new one.
--
-- Apply this only after the app from step 2 is live on production and has
-- been checked there. Until this runs, undoing step 1 is a matter of dropping
-- what it made; after it, the old tables are gone and undoing means restoring
-- from the backup taken before step 1.
--
-- No `if exists` anywhere. Every object named here was made by an earlier
-- migration, so one that is missing means the database is not in the state
-- this expects, and the right response is to stop rather than carry on. This
-- project has shipped a silent no-op before (a policy dropped by a name it
-- never had), and `if exists` is how that happens.

/* ------------------------------------------------ the compatibility views */

-- Their `instead of` triggers go with them.
drop view public.words;
drop view public.phrases;
drop view public.verb_tables;
drop view public.card_faces;

/* ------------------------------------------------------- old functions */

drop function public.words_write();
drop function public.phrases_write();
drop function public.verb_tables_write();
drop function public.set_item_categories(uuid, uuid, text[]);
drop function public.sync_category_tags(text[]);
drop function public.build_flashcard_deck(text[], uuid[], boolean, boolean, integer, text);
drop function public.apply_review(uuid, text, uuid, uuid, integer, date);
drop function public.rename_category(text, text);
drop function public.rename_source(text, text);

/* ---------------------------------------------------------- old tables */

-- Children before parents, and no `cascade`: a cascade would also remove
-- anything new that had come to depend on these without anyone noticing,
-- and nothing new should.
drop table public.deck_items;
drop table public.flashcard_decks;
drop table public.review_logs;
drop table public.progress_summary;
drop table public.daily_study;
drop table public.study_sessions;
drop table public.user_goals;
drop table public.legacy_item_tags;
drop table public.legacy_tags;
drop table public.word_details;
drop table public.phrase_details;
drop table public.verb_table_details;
drop table public.learning_items;
drop table public.item_types;

-- The two lists that became the `tags` and `sources` tables. Step 1 copied
-- them, but the old app could still save Settings until the new one was
-- deployed, so any name added in that window is copied now, before the
-- columns go. Their check constraints go with the columns.
insert into public.tags (user_id, context, name)
select distinct on (s.user_id, lower(btrim(n))) s.user_id, 'collection', btrim(n)
from public.user_settings s, unnest(s.categories) n
where btrim(n) <> '' and length(btrim(n)) <= 60
order by s.user_id, lower(btrim(n))
on conflict (user_id, context, lower(name)) do nothing;

insert into public.sources (user_id, name)
select distinct on (s.user_id, lower(btrim(n))) s.user_id, btrim(n)
from public.user_settings s, unnest(s.sources) n
where btrim(n) <> '' and length(btrim(n)) <= 60
order by s.user_id, lower(btrim(n))
on conflict (user_id, lower(name)) do nothing;

alter table public.user_settings drop column categories;
alter table public.user_settings drop column sources;

/* ---------------------------------------------------------- the proof */

-- Only the new schema is left: exactly nine tables, no view, exactly seven
-- functions, and the settings row without its list columns.
do $$
declare
  actual text[];
begin
  select array_agg(c.relname::text order by c.relname) into actual
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p');
  if actual is distinct from array['deck_cards', 'decks', 'item_tags', 'items', 'progress',
                                   'reviews', 'sources', 'tags', 'user_settings'] then
    raise exception 'public tables are not the expected set: %', actual;
  end if;

  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relkind in ('v', 'm')) then
    raise exception 'a view is left in public';
  end if;

  select array_agg(p.proname::text order by p.proname) into actual
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public';
  if actual is distinct from array['build_deck', 'items_guard', 'record_review',
                                   'rename_item_source', 'rename_tag', 'save_items',
                                   'set_updated_at'] then
    raise exception 'public functions are not the expected set: %', actual;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'user_settings'
               and column_name in ('categories', 'sources')) then
    raise exception 'user_settings still has a list column';
  end if;
end;
$$;

-- The security shape of the new tables, checked rather than assumed. The same
-- block ends `refactor_drop_old_schema`. This project has shipped a silent
-- no-op before (a policy dropped by a name it never had), so nothing here
-- settles for "at least one": the policies, what each one tests, the grants,
-- the functions and what anon can reach are each compared with an exact list.
do $$
declare
  owner_test constant text := '(( SELECT auth.uid() AS uid) = user_id)';
  new_tables constant text[] := array[
    'deck_cards', 'decks', 'item_tags', 'items', 'progress', 'reviews',
    'sources', 'tags', 'user_settings'
  ];
  expected_policies constant text[] := array[
    'deck_cards:DELETE', 'deck_cards:INSERT', 'deck_cards:SELECT',
    'decks:DELETE', 'decks:INSERT', 'decks:SELECT',
    'item_tags:DELETE', 'item_tags:INSERT', 'item_tags:SELECT',
    'items:DELETE', 'items:INSERT', 'items:SELECT', 'items:UPDATE',
    'progress:INSERT', 'progress:SELECT', 'progress:UPDATE',
    'reviews:INSERT', 'reviews:SELECT',
    'sources:DELETE', 'sources:INSERT', 'sources:SELECT', 'sources:UPDATE',
    'tags:DELETE', 'tags:INSERT', 'tags:SELECT', 'tags:UPDATE',
    'user_settings:INSERT', 'user_settings:SELECT', 'user_settings:UPDATE'
  ];
  -- What `authenticated` may do, table by table. A command with no policy is
  -- also absent here, which is the second lock.
  expected_grants constant text[] := array[
    'deck_cards:DELETE', 'deck_cards:INSERT', 'deck_cards:SELECT',
    'decks:DELETE', 'decks:INSERT', 'decks:SELECT',
    'item_tags:DELETE', 'item_tags:INSERT', 'item_tags:SELECT',
    'items:DELETE', 'items:INSERT', 'items:SELECT', 'items:UPDATE',
    'progress:INSERT', 'progress:SELECT', 'progress:UPDATE',
    'reviews:INSERT', 'reviews:SELECT',
    'sources:DELETE', 'sources:INSERT', 'sources:SELECT', 'sources:UPDATE',
    'tags:DELETE', 'tags:INSERT', 'tags:SELECT', 'tags:UPDATE',
    'user_settings:INSERT', 'user_settings:SELECT', 'user_settings:UPDATE'
  ];
  new_functions constant text[] := array[
    'build_deck', 'items_guard', 'record_review', 'rename_item_source',
    'rename_tag', 'save_items', 'set_updated_at'
  ];
  callable constant text[] := array[
    'build_deck', 'record_review', 'rename_item_source', 'rename_tag', 'save_items'
  ];
  actual text[];
  bad text;
begin
  -- Row level security on every table in public.
  select c.relname into bad from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity limit 1;
  if bad is not null then
    raise exception 'row level security is off on %', bad;
  end if;

  -- Exactly these policies on the new tables...
  select array_agg(tablename || ':' || cmd order by tablename || ':' || cmd) into actual
  from pg_policies where schemaname = 'public' and tablename = any (new_tables);
  if actual is distinct from expected_policies then
    raise exception 'policies are not the expected set: %', actual;
  end if;

  -- ...each permissive, for authenticated, and testing the owner and nothing
  -- else: `using` for the commands that read or remove a row, `with check`
  -- for the ones that write one, both for update.
  select tablename || ':' || cmd into bad from pg_policies
  where schemaname = 'public' and tablename = any (new_tables)
    and (
      permissive <> 'PERMISSIVE'
      or roles <> '{authenticated}'
      or (cmd in ('SELECT', 'DELETE') and (qual is distinct from owner_test or with_check is not null))
      or (cmd = 'INSERT' and (qual is not null or with_check is distinct from owner_test))
      or (cmd = 'UPDATE' and (qual is distinct from owner_test or with_check is distinct from owner_test))
    )
  limit 1;
  if bad is not null then
    raise exception 'policy % does not test the owner the way every policy must', bad;
  end if;

  -- Exactly these grants to authenticated.
  select array_agg(t || ':' || upper(priv) order by t || ':' || upper(priv)) into actual
  from unnest(new_tables) as t,
       unnest(array['select', 'insert', 'update', 'delete', 'truncate', 'references', 'trigger']) as priv
  where has_table_privilege('authenticated', format('public.%I', t), priv);
  if actual is distinct from expected_grants then
    raise exception 'grants to authenticated are not the expected set: %', actual;
  end if;

  -- The new functions: none definer, all with an empty path, and only the
  -- callable ones executable by a signed-in reader.
  select p.proname into bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any (new_functions)
    and (p.prosecdef or p.proconfig is distinct from array['search_path=""'])
  limit 1;
  if bad is not null then
    raise exception 'function % is definer or lacks an empty search_path', bad;
  end if;

  select array_agg(p.proname::text order by p.proname) into actual
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any (new_functions)
    and has_function_privilege('authenticated', p.oid, 'execute');
  if actual is distinct from callable then
    raise exception 'authenticated can execute the wrong functions: %', actual;
  end if;

  -- Nothing at all for anon: no table, column, sequence or function in public.
  select c.relname into bad from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and (
      (c.relkind in ('r', 'v', 'm', 'p')
       and (has_table_privilege('anon', c.oid, 'select, insert, update, delete, truncate, references, trigger')
            or has_any_column_privilege('anon', c.oid, 'select, insert, update, references')))
      or (c.relkind = 'S' and has_sequence_privilege('anon', c.oid, 'usage, select, update'))
    )
  limit 1;
  if bad is not null then
    raise exception 'anon has a privilege on %', bad;
  end if;

  select p.proname into bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
  limit 1;
  if bad is not null then
    raise exception 'anon can execute %', bad;
  end if;

  -- And nothing for anon, or for PUBLIC (which includes it), in the defaults
  -- that apply to what migrations create next: those `postgres` holds, in
  -- public or for every schema. Supabase keeps its own under
  -- `supabase_admin`, which a migration cannot change.
  if exists (
    select 1 from pg_default_acl d
    cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole = 'postgres'::regrole::oid
      and (d.defaclnamespace = 0 or d.defaclnamespace = 'public'::regnamespace::oid)
      and a.grantee in ('anon'::regrole::oid, 0)
  ) then
    raise exception 'default privileges still grant anon or PUBLIC something';
  end if;
end;
$$;
