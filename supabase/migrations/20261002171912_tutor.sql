-- The grammar tutor (Docs/tutor.md): who may use it, how much, and the two
-- settings it reads. The plan is readable by its account and writable by no
-- one but an administrator, so nobody can upgrade themselves; usage can only
-- grow, so nobody can wind back their count.

create table public.account_plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'paid')),
  updated_at timestamptz not null default now()
);
alter table public.account_plans enable row level security;
create policy account_plans_select on public.account_plans
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.account_plans from public, anon, authenticated;
grant select on public.account_plans to authenticated;

create table public.tutor_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
-- Serves the two counts the route makes on every question: all of an
-- account's rows, and its rows since midnight UTC.
create index tutor_usage_user_created_idx on public.tutor_usage (user_id, created_at);
alter table public.tutor_usage enable row level security;
create policy tutor_usage_select on public.tutor_usage
  for select to authenticated using ((select auth.uid()) = user_id);
create policy tutor_usage_insert on public.tutor_usage
  for insert to authenticated with check ((select auth.uid()) = user_id);
revoke all on public.tutor_usage from public, anon, authenticated;
-- Insert is limited to the owner column, so a row cannot be given a backdated
-- created_at or a chosen id to dodge the daily count.
grant select, insert (user_id) on public.tutor_usage to authenticated;

-- The native language has the same shape as the studied one, and the same
-- checks as 20260924101234_language_and_sort_skip_words.sql. The level is a
-- CEFR band, or empty for not said.
alter table public.user_settings
  add column native_language text not null default '',
  add column native_language_other text not null default '',
  add column level text not null default '',
  add constraint user_settings_native_language_code
    check (native_language ~ '^([a-z]{2,3})?$'),
  add constraint user_settings_native_language_other_sane
    check (length(native_language_other) <= 60 and native_language_other = btrim(native_language_other)),
  add constraint user_settings_one_native_language
    check (native_language = '' or native_language_other = ''),
  add constraint user_settings_level
    check (level in ('', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'));

-- Checked rather than assumed: the policies and grants are exactly these.
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'account_plans'
             and cmd <> 'SELECT') then
    raise exception 'account_plans has a write policy';
  end if;
  if has_table_privilege('authenticated', 'public.account_plans', 'insert')
     or has_table_privilege('authenticated', 'public.account_plans', 'update')
     or has_table_privilege('authenticated', 'public.account_plans', 'delete')
     or has_table_privilege('authenticated', 'public.account_plans', 'truncate')
     or has_table_privilege('authenticated', 'public.account_plans', 'references')
     or has_table_privilege('authenticated', 'public.account_plans', 'trigger')
     or has_table_privilege('authenticated', 'public.tutor_usage', 'truncate')
     or has_table_privilege('authenticated', 'public.tutor_usage', 'references')
     or has_table_privilege('authenticated', 'public.tutor_usage', 'trigger')
     or has_column_privilege('authenticated', 'public.tutor_usage', 'created_at', 'insert')
     or has_column_privilege('authenticated', 'public.tutor_usage', 'id', 'insert')
     or has_table_privilege('authenticated', 'public.tutor_usage', 'update')
     or has_table_privilege('authenticated', 'public.tutor_usage', 'delete')
     or has_table_privilege('anon', 'public.account_plans', 'select')
     or has_table_privilege('anon', 'public.tutor_usage', 'select') then
    raise exception 'a tutor table has a grant it must not have';
  end if;
end;
$$;
