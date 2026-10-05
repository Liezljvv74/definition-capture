-- Conversations (README, Conversations): the messages of an account's one
-- open conversation, so it survives a reload. "New conversation" deletes them,
-- so there is no conversation id: an account has one conversation or none, and
-- nothing is kept that no page can show.

create table public.conversation_messages (
  -- An identity rather than a uuid, because it is also the order: the route
  -- inserts a question and its reply in one statement, which gives both rows
  -- the same created_at.
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  -- A question is at most 1000 characters; a reply is cut to 32000 by the route.
  content text not null check (length(content) between 1 and 32000),
  created_at timestamptz not null default now()
);
-- Serves the page's one read, an account's messages in order, and the delete.
create index conversation_messages_user_id_idx on public.conversation_messages (user_id, id);

alter table public.conversation_messages enable row level security;
create policy conversation_messages_select on public.conversation_messages
  for select to authenticated using ((select auth.uid()) = user_id);
create policy conversation_messages_insert on public.conversation_messages
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy conversation_messages_delete on public.conversation_messages
  for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.conversation_messages from public, anon, authenticated;
-- No update: a message is written once. Insert is limited to these columns, so
-- the order and the time stay the database's.
grant select, delete, insert (user_id, role, content) on public.conversation_messages to authenticated;

-- Checked rather than assumed: the policies and grants are exactly these.
do $$
begin
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'conversation_messages') <> 3
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'conversation_messages'
                and cmd not in ('SELECT', 'INSERT', 'DELETE')) then
    raise exception 'conversation_messages has the wrong policies';
  end if;
  if has_table_privilege('authenticated', 'public.conversation_messages', 'update')
     or has_table_privilege('authenticated', 'public.conversation_messages', 'truncate')
     or has_table_privilege('authenticated', 'public.conversation_messages', 'references')
     or has_table_privilege('authenticated', 'public.conversation_messages', 'trigger')
     or has_column_privilege('authenticated', 'public.conversation_messages', 'id', 'insert')
     or has_column_privilege('authenticated', 'public.conversation_messages', 'created_at', 'insert')
     or has_table_privilege('anon', 'public.conversation_messages', 'select') then
    raise exception 'conversation_messages has a grant it must not have';
  end if;
end;
$$;
