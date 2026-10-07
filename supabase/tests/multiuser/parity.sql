-- A fingerprint of every protection on the public schema: row level security
-- on each table, every policy, the table and column grants to anon and
-- authenticated, and each function's security settings and who may run it.
-- Run it on the local copy and on the live project: equal fingerprints mean a
-- multi-user test on the local copy holds for the live site. Read-only.
select md5(string_agg(x, E'\n' order by x)) as fp, count(*) as n from (
  select 'P ' || tablename || ' ' || policyname || ' ' || cmd || ' ' || array_to_string(roles, ',') || ' ' || coalesce(qual, '') || ' ' || coalesce(with_check, '') as x
    from pg_policies where schemaname = 'public'
  union all select 'R ' || relname || ' ' || relrowsecurity
    from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
  union all select 'G ' || table_name || ' ' || grantee || ' ' || privilege_type
    from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated')
  union all select 'C ' || table_name || ' ' || column_name || ' ' || grantee || ' ' || privilege_type
    from information_schema.column_privileges where table_schema = 'public' and grantee in ('anon', 'authenticated')
  union all select 'F ' || p.proname || ' ' || p.prosecdef || ' ' || coalesce(array_to_string(p.proconfig, ','), '') || ' '
      || has_function_privilege('anon', p.oid, 'execute') || ' ' || has_function_privilege('authenticated', p.oid, 'execute')
    from pg_proc p where p.pronamespace = 'public'::regnamespace
) t;
