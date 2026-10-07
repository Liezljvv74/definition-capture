-- Tutor conversations (Docs/tutor-conversations.md): many saved conversations
-- per account, each a list of exchanges (a question and its answer, or a rule
-- merged from several answers), searchable by keyword and by meaning, the
-- rules saved from each, and a log of searches for the hourly limit. Replaces
-- the one open conversation of conversation_messages, whose rows are deleted
-- here (the owner's decision, 7 October 2026) and whose table is dropped by a
-- later migration, once no deployed code reads it.
--
-- Sized for the free plan's 500 MB, which every account shares: vectors are
-- half precision and kept in the row, the keyword index is on an expression
-- rather than a stored column, a reply is capped at 64 KB, and an account
-- holds at most 2,000 exchanges and 500 conversations (the owner's decision,
-- 7 October 2026). The caps are checked by the database, so a row an account
-- inserts directly with the publishable key is held to them too.

-- pgvector, in `extensions` as Supabase recommends; everything below names it
-- with its schema, as functions here run with an empty search_path.
create extension if not exists vector with schema extensions;
-- pg_cron, for the nightly clearing of the search log.
create extension if not exists pg_cron with schema pg_catalog;

-- How many rows of a table one account may hold, checked on every insert.
-- Security invoker: the count runs under the caller's row level security,
-- which shows exactly the caller's own rows, and the index leading with
-- user_id makes it an index-only count of at most a few thousand entries.
-- ponytail: two inserts racing can each see one under the limit and both
-- pass, so an account can end up one or two over; the limit is about
-- storage, not exactness.
create function public.enforce_row_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  held bigint;
begin
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name)
    into held using new.user_id;
  if held >= tg_argv[0]::bigint then
    raise exception 'row limit reached on %', tg_table_name using errcode = 'program_limit_exceeded';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_row_limit() from public, anon, authenticated;

create table public.tutor_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 120 and name = btrim(name)),
  created_at timestamptz not null default now(),
  -- Last activity, which orders the sidebar; the route sets it on each exchange.
  updated_at timestamptz not null default now(),
  -- What the exchanges and the rule links point their composite keys at.
  unique (id, user_id)
);
-- Serves the sidebar's one read, newest activity first, and the limit's count.
create index tutor_conversations_user_updated_idx on public.tutor_conversations (user_id, updated_at desc);
create trigger tutor_conversations_limit before insert on public.tutor_conversations
  for each row execute function public.enforce_row_limit('500');

alter table public.tutor_conversations enable row level security;
create policy tutor_conversations_select on public.tutor_conversations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy tutor_conversations_insert on public.tutor_conversations
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy tutor_conversations_update on public.tutor_conversations
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy tutor_conversations_delete on public.tutor_conversations
  for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.tutor_conversations from public, anon, authenticated;
grant select, delete, insert (user_id, name), update (name, updated_at) on public.tutor_conversations to authenticated;

create table public.tutor_exchanges (
  -- An identity rather than a uuid, because it is also the order.
  id bigint generated always as identity primary key,
  conversation_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('answer', 'merge')),
  -- A question is at most 1000 characters; a merge stores its label here.
  question text not null check (length(question) between 1 and 1000),
  -- The answer as the page shows it (TutorReply). Read back through
  -- readStoredReply, since the account can insert a row of its own. 64 KB is
  -- twice what a 32000-character answer needs, and bounds what one row costs.
  reply jsonb not null check (jsonb_typeof(reply) = 'object' and octet_length(reply::text) <= 64000),
  -- What the model is sent back, and exactly what the signature covers.
  answer_text text not null check (length(answer_text) between 1 and 32000),
  signature text not null check (signature ~ '^[0-9a-f]{64}$'),
  -- Half precision: half the space and the reading of a full vector, for a
  -- loss in search quality too small to notice. Null when embedding failed or
  -- ran out of time: the exchange is still found by keyword.
  embedding extensions.halfvec(1024),
  created_at timestamptz not null default now(),
  foreign key (conversation_id, user_id) references public.tutor_conversations (id, user_id) on delete cascade
);
-- A halfvec(1024) is just over the 2 KB at which Postgres moves a value out
-- of the row; kept in the row, an exact scan reads the table, not a second one.
alter table public.tutor_exchanges alter column embedding set storage main;
-- Serves loading a conversation in order, the cascade from a conversation, and the limit's count.
create index tutor_exchanges_user_conversation_idx on public.tutor_exchanges (user_id, conversation_id, id);
-- Keyword search, on an expression rather than a stored column, which would
-- keep a second copy of the text in every row. 'simple' does no stemming but
-- treats every language alike; the vector half covers what stemming would.
-- search_tutor must use exactly this expression for the index to apply.
create index tutor_exchanges_fts_idx on public.tutor_exchanges
  using gin (to_tsvector('simple'::regconfig, question || ' ' || answer_text));
-- ponytail: no vector index; an exact scan of one account's rows (at most
-- 2,000) is fast. Add HNSW with hnsw.iterative_scan = relaxed_order if
-- EXPLAIN shows the scan slowing, since an approximate index filters after it scans.
create trigger tutor_exchanges_limit before insert on public.tutor_exchanges
  for each row execute function public.enforce_row_limit('2000');

alter table public.tutor_exchanges enable row level security;
create policy tutor_exchanges_select on public.tutor_exchanges
  for select to authenticated using ((select auth.uid()) = user_id);
create policy tutor_exchanges_insert on public.tutor_exchanges
  for insert to authenticated with check ((select auth.uid()) = user_id);
revoke all on public.tutor_exchanges from public, anon, authenticated;
-- No update and no delete: an exchange is written once, and goes with its
-- conversation. Insert is limited to these columns, so the order and the time
-- stay the database's.
grant select, insert (conversation_id, user_id, kind, question, reply, answer_text, signature, embedding)
  on public.tutor_exchanges to authenticated;

create table public.tutor_conversation_rules (
  conversation_id uuid not null,
  item_id uuid not null,
  -- Defaulted, so the browser records a link without looking up its own id.
  -- No reference to auth.users of its own: both composite keys below cascade
  -- when the account goes, through its conversations and its items.
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (conversation_id, item_id),
  foreign key (conversation_id, user_id) references public.tutor_conversations (id, user_id) on delete cascade,
  -- A rule that failed to save has no row here to point at, so its link is refused.
  foreign key (item_id, user_id) references public.items (id, user_id) on delete cascade
);
-- Serves the cascade when a rule is deleted.
create index tutor_conversation_rules_item_idx on public.tutor_conversation_rules (item_id, user_id);

alter table public.tutor_conversation_rules enable row level security;
create policy tutor_conversation_rules_select on public.tutor_conversation_rules
  for select to authenticated using ((select auth.uid()) = user_id);
create policy tutor_conversation_rules_insert on public.tutor_conversation_rules
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy tutor_conversation_rules_delete on public.tutor_conversation_rules
  for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.tutor_conversation_rules from public, anon, authenticated;
grant select, delete, insert (conversation_id, item_id, user_id) on public.tutor_conversation_rules to authenticated;

-- One row per sidebar search, so an account's searches in the last hour can
-- be counted (100 an hour, the owner's decision, 7 October 2026), the way
-- tutor_usage counts questions: each search embeds its query with the shared
-- OpenRouter key, and heavy use by one account could get that key limited for
-- everyone. Insert only: an account that could delete its rows could reset
-- its own count. A nightly job clears rows older than a day, which no count
-- looks at, so the table stays small.
create table public.tutor_searches (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
-- Serves the hourly count.
create index tutor_searches_user_created_idx on public.tutor_searches (user_id, created_at);

alter table public.tutor_searches enable row level security;
create policy tutor_searches_select on public.tutor_searches
  for select to authenticated using ((select auth.uid()) = user_id);
create policy tutor_searches_insert on public.tutor_searches
  for insert to authenticated with check ((select auth.uid()) = user_id);
revoke all on public.tutor_searches from public, anon, authenticated;
-- Insert is limited to the owner column, so a row cannot be backdated out of the count.
grant select, insert (user_id) on public.tutor_searches to authenticated;

select cron.schedule(
  'tutor-searches-cleanup',
  '17 3 * * *',
  $cron$delete from public.tutor_searches where created_at < now() - interval '1 day'$cron$
);

-- Keyword and meaning search over the caller's exchanges, fused by reciprocal
-- rank (k = 50), after supabase.com/docs/guides/ai/hybrid-search. Security
-- invoker, so row level security applies; the user_id filters are there as
-- well so the planner uses the index rather than relying on the policy. A
-- null query_embedding gives keyword results only. It returns no reply JSON:
-- the sidebar and the tutor's memory use the text, and a reply can be 64 KB.
create function public.search_tutor(query text, query_embedding extensions.halfvec(1024), match_count integer)
returns table (
  exchange_id bigint,
  conversation_id uuid,
  conversation_name text,
  kind text,
  question text,
  answer_text text,
  signature text,
  score double precision
)
language sql
stable
security invoker
set search_path = ''
as $$
  with keyword as (
    select e.id,
      row_number() over (order by ts_rank_cd(to_tsvector('simple'::regconfig, e.question || ' ' || e.answer_text), q) desc) as rank
    from public.tutor_exchanges e, websearch_to_tsquery('simple'::regconfig, query) q
    where e.user_id = (select auth.uid())
      and to_tsvector('simple'::regconfig, e.question || ' ' || e.answer_text) @@ q
    order by rank
    limit least(greatest(match_count, 1), 50) * 2
  ),
  semantic as (
    select e.id, row_number() over (order by e.embedding operator(extensions.<=>) query_embedding) as rank
    from public.tutor_exchanges e
    where query_embedding is not null
      and e.user_id = (select auth.uid())
      and e.embedding is not null
      -- Without a cut-off the nearest rows always come back, related or not,
      -- and the tutor would be given unrelated memories with every question.
      -- ponytail: one fixed cosine distance; tuned against real searches in
      -- Task 11, and changed by replacing this function.
      and e.embedding operator(extensions.<=>) query_embedding < 0.5
    order by rank
    limit least(greatest(match_count, 1), 50) * 2
  )
  select e.id, e.conversation_id, c.name, e.kind, e.question, e.answer_text, e.signature,
    (coalesce(1.0 / (50 + k.rank), 0.0) + coalesce(1.0 / (50 + s.rank), 0.0))::double precision as score
  from keyword k
  full outer join semantic s on k.id = s.id
  join public.tutor_exchanges e on e.id = coalesce(k.id, s.id)
  join public.tutor_conversations c on c.id = e.conversation_id
  order by score desc, e.id desc
  limit least(greatest(match_count, 1), 50);
$$;
revoke execute on function public.search_tutor(text, extensions.halfvec, integer) from public, anon;
grant execute on function public.search_tutor(text, extensions.halfvec, integer) to authenticated;

-- The old one-conversation page is removed; its plain-text chats cannot be
-- shown as tutor answers, so they are deleted rather than carried across.
delete from public.conversation_messages;

-- Checked rather than assumed: the policies, grants and jobs are exactly these.
do $$
begin
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'tutor_conversations') <> 4
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'tutor_exchanges') <> 2
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('tutor_exchanges', 'tutor_searches')
                and cmd not in ('SELECT', 'INSERT'))
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'tutor_searches') <> 2
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'tutor_conversation_rules') <> 3
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tutor_conversation_rules'
                and cmd not in ('SELECT', 'INSERT', 'DELETE')) then
    raise exception 'a tutor conversation table has the wrong policies';
  end if;
  if has_table_privilege('authenticated', 'public.tutor_exchanges', 'update')
     or has_table_privilege('authenticated', 'public.tutor_exchanges', 'delete')
     or has_table_privilege('authenticated', 'public.tutor_searches', 'update')
     or has_table_privilege('authenticated', 'public.tutor_searches', 'delete')
     or has_column_privilege('authenticated', 'public.tutor_searches', 'created_at', 'insert')
     or has_table_privilege('authenticated', 'public.tutor_conversation_rules', 'update')
     or has_column_privilege('authenticated', 'public.tutor_exchanges', 'id', 'insert')
     or has_column_privilege('authenticated', 'public.tutor_exchanges', 'created_at', 'insert')
     or has_column_privilege('authenticated', 'public.tutor_conversations', 'user_id', 'update')
     or has_column_privilege('authenticated', 'public.tutor_conversations', 'id', 'insert')
     or has_table_privilege('authenticated', 'public.tutor_conversations', 'truncate')
     or has_table_privilege('authenticated', 'public.tutor_exchanges', 'truncate')
     or has_table_privilege('authenticated', 'public.tutor_conversation_rules', 'truncate')
     or has_table_privilege('authenticated', 'public.tutor_searches', 'truncate')
     or has_table_privilege('anon', 'public.tutor_conversations', 'select')
     or has_table_privilege('anon', 'public.tutor_exchanges', 'select')
     or has_table_privilege('anon', 'public.tutor_conversation_rules', 'select')
     or has_table_privilege('anon', 'public.tutor_searches', 'select')
     or has_function_privilege('anon', 'public.search_tutor(text, extensions.halfvec, integer)', 'execute') then
    raise exception 'a tutor conversation table has a grant it must not have';
  end if;
  if not exists (select 1 from cron.job where jobname = 'tutor-searches-cleanup') then
    raise exception 'the search log clean-up is not scheduled';
  end if;
end;
$$;
