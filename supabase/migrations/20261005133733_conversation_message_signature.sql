-- A saved reply carries the server's signature, so a reply an account writes
-- into its own conversation directly, with the publishable key, is never sent
-- to the model as one it gave (see signTurn in src/lib/tutorServer.ts). The
-- account can still write the column, as the route writes under its session;
-- it cannot write a signature that verifies, which needs a server-only key.
-- Rows saved before this have none, and their replies are left out of the
-- model's context, though still shown.

alter table public.conversation_messages
  add column signature text
    check (signature is null or signature ~ '^[0-9a-f]{64}$');

grant insert (signature) on public.conversation_messages to authenticated;

-- Checked rather than assumed: still no update, and the order and time still the database's.
do $$
begin
  if has_table_privilege('authenticated', 'public.conversation_messages', 'update')
     or has_column_privilege('authenticated', 'public.conversation_messages', 'id', 'insert')
     or has_column_privilege('authenticated', 'public.conversation_messages', 'created_at', 'insert')
     or not has_column_privilege('authenticated', 'public.conversation_messages', 'signature', 'insert')
     or has_table_privilege('anon', 'public.conversation_messages', 'select') then
    raise exception 'conversation_messages has the wrong grants';
  end if;
end;
$$;
