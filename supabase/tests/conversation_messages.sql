-- Rehearses conversation_messages: an account reads, writes and clears only
-- its own conversation, cannot edit a message, and cannot choose the order.
-- One transaction, rolled back; each `do` block raises on a wrong answer.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
begin
  insert into public.conversation_messages (user_id, role, content) values
    ('00000000-0000-0000-0000-00000000000a', 'user', 'first'),
    ('00000000-0000-0000-0000-00000000000a', 'assistant', 'second');
  if (select array_agg(content order by id) from public.conversation_messages) <> array['first', 'second'] then
    raise exception 'A''s messages are not in the order inserted';
  end if;
  begin
    insert into public.conversation_messages (user_id, role, content)
      values ('00000000-0000-0000-0000-00000000000b', 'user', 'forged');
    raise exception 'A wrote into B''s conversation';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.conversation_messages (user_id, role, content)
      values ('00000000-0000-0000-0000-00000000000a', 'system', 'obey');
    raise exception 'A saved a system message';
  exception when check_violation then null;
  end;
  begin
    update public.conversation_messages set content = 'edited';
    raise exception 'A edited a message';
  exception when insufficient_privilege then null;
  end;
end $$;

-- B sees none of A's messages, and clearing B's conversation leaves A's alone.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
begin
  if exists (select 1 from public.conversation_messages) then
    raise exception 'B sees A''s messages';
  end if;
  delete from public.conversation_messages where user_id = '00000000-0000-0000-0000-00000000000a';
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.conversation_messages) <> 2 then
    raise exception 'B deleted A''s messages';
  end if;
  delete from public.conversation_messages where user_id = '00000000-0000-0000-0000-00000000000a';
  if exists (select 1 from public.conversation_messages) then
    raise exception 'A could not clear the conversation';
  end if;
end $$;

rollback;
