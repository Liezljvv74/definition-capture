-- Rehearses the tutor conversation tables and search_tutor: each account
-- reads and writes only its own rows, exchanges cannot be edited or deleted
-- directly, links cannot cross accounts, deletes cascade, the per-account
-- limits hold, the search log cannot be cleared by its account, and search
-- sees only the caller's rows and nothing unrelated. One transaction, rolled
-- back; each `do` block raises on a wrong answer.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test');
-- A rule each, made as an administrator, as save_items would; a grammar item must have blocks.
insert into public.items (id, user_id, item_type, title, blocks) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'grammar', 'Dative', '[]'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'grammar', 'Genitive', '[]');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare
  conv uuid;
  sig text := repeat('0', 64);
  near extensions.halfvec(1024) := array_fill(0.1, array[1024])::extensions.halfvec;
  far extensions.halfvec(1024) := array_fill(-0.1, array[1024])::extensions.halfvec;
begin
  insert into public.tutor_conversations (user_id, name)
    values ('00000000-0000-0000-0000-00000000000a', 'Dative case') returning id into conv;
  -- Kept for B's block, which tries to write into A's conversation.
  perform set_config('test.conv', conv::text, true);
  insert into public.tutor_exchanges (conversation_id, user_id, kind, question, reply, answer_text, signature, embedding) values
    (conv, '00000000-0000-0000-0000-00000000000a', 'answer', 'When is the dative used?', '{"title":"Dative"}', 'Dative after mit and nach', sig, near),
    (conv, '00000000-0000-0000-0000-00000000000a', 'answer', 'And the accusative?', '{"title":"Accusative"}', 'Accusative after durch', sig, null);

  if (select count(*) from public.search_tutor('mit', null, 10)) <> 1 then
    raise exception 'keyword search did not find the dative exchange';
  end if;
  if (select count(*) from public.search_tutor('zzzz', near, 10)) <> 1 then
    raise exception 'meaning search did not find the embedded exchange';
  end if;
  -- Punctuation only, words found nowhere, and a meaning far from everything: nothing, and no error.
  if exists (select 1 from public.search_tutor('"', null, 10))
     or exists (select 1 from public.search_tutor('-', null, 10))
     or exists (select 1 from public.search_tutor('!', null, 10))
     or exists (select 1 from public.search_tutor('nowhere', null, 10))
     or exists (select 1 from public.search_tutor('nowhere', far, 10)) then
    raise exception 'a search with nothing to match returned rows';
  end if;

  begin
    update public.tutor_exchanges set answer_text = 'edited';
    raise exception 'A edited an exchange';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.tutor_exchanges;
    raise exception 'A deleted an exchange directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.tutor_exchanges (conversation_id, user_id, kind, question, reply, answer_text, signature)
      values (conv, '00000000-0000-0000-0000-00000000000a', 'answer', 'q', jsonb_build_object('t', repeat('x', 64001)), 'a', sig);
    raise exception 'A saved a reply over 64 KB';
  exception when check_violation then null;
  end;
  begin
    insert into public.tutor_conversations (user_id, name) values ('00000000-0000-0000-0000-00000000000a', '   ');
    raise exception 'A saved a blank name';
  exception when check_violation then null;
  end;
  begin
    insert into public.tutor_conversations (user_id, name) values ('00000000-0000-0000-0000-00000000000a', repeat('x', 121));
    raise exception 'A saved a name over 120 characters';
  exception when check_violation then null;
  end;
  begin
    insert into public.tutor_conversations (user_id, name) values ('00000000-0000-0000-0000-00000000000b', 'Forged');
    raise exception 'A made a conversation for B';
  exception when insufficient_privilege then null;
  end;

  -- A link to A's own rule is kept; one to B's rule, or to a rule never saved, is refused.
  insert into public.tutor_conversation_rules (conversation_id, item_id) values (conv, '00000000-0000-0000-0000-0000000000a1');
  begin
    insert into public.tutor_conversation_rules (conversation_id, item_id) values (conv, '00000000-0000-0000-0000-0000000000b1');
    raise exception 'A linked B''s rule';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.tutor_conversation_rules (conversation_id, item_id) values (conv, gen_random_uuid());
    raise exception 'A linked a rule that does not exist';
  exception when foreign_key_violation then null;
  end;

  -- The search log takes rows and cannot be cleared by its account.
  insert into public.tutor_searches (user_id) values ('00000000-0000-0000-0000-00000000000a');
  begin
    delete from public.tutor_searches;
    raise exception 'A cleared its own search log';
  exception when insufficient_privilege then null;
  end;
end $$;

-- B sees none of A's rows, finds nothing of A's, and cannot write into, link
-- to, or rename A's conversation.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare
  changed integer;
begin
  if exists (select 1 from public.tutor_conversations) or exists (select 1 from public.tutor_exchanges)
     or exists (select 1 from public.tutor_conversation_rules) or exists (select 1 from public.tutor_searches) then
    raise exception 'B sees A''s rows';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'tutor_searches_limit') then
    raise exception 'tutor_searches has no row limit';
  end if;
  if exists (select 1 from public.search_tutor('mit', null, 10)) then
    raise exception 'B''s search found A''s exchange';
  end if;
  begin
    insert into public.tutor_exchanges (conversation_id, user_id, kind, question, reply, answer_text, signature)
      values (current_setting('test.conv')::uuid, '00000000-0000-0000-0000-00000000000b', 'answer', 'q', '{}', 'a', repeat('0', 64));
    raise exception 'B wrote an exchange into A''s conversation';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.tutor_conversation_rules (conversation_id, item_id)
      values (current_setting('test.conv')::uuid, '00000000-0000-0000-0000-0000000000b1');
    raise exception 'B linked a rule to A''s conversation';
  exception when foreign_key_violation then null;
  end;
  update public.tutor_conversations set name = 'Taken' where id = current_setting('test.conv')::uuid;
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'B renamed A''s conversation';
  end if;
end $$;

-- The limits: 2,000 exchanges and 500 conversations per account, whoever inserts them.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare
  conv uuid := current_setting('test.conv')::uuid;
begin
  insert into public.tutor_exchanges (conversation_id, user_id, kind, question, reply, answer_text, signature)
    select conv, '00000000-0000-0000-0000-00000000000a', 'answer', 'q', '{}', 'a', repeat('0', 64)
    from generate_series(1, 1998);
  begin
    insert into public.tutor_exchanges (conversation_id, user_id, kind, question, reply, answer_text, signature)
      values (conv, '00000000-0000-0000-0000-00000000000a', 'answer', 'q', '{}', 'a', repeat('0', 64));
    raise exception 'A saved a 2,001st exchange';
  exception when program_limit_exceeded then null;
  end;
  insert into public.tutor_conversations (user_id, name)
    select '00000000-0000-0000-0000-00000000000a', 'c' || n from generate_series(1, 499) n;
  begin
    insert into public.tutor_conversations (user_id, name) values ('00000000-0000-0000-0000-00000000000a', 'one too many');
    raise exception 'A made a 501st conversation';
  exception when program_limit_exceeded then null;
  end;
end $$;

-- Deleting A's rule removes its link; deleting A's conversations removes their exchanges.
do $$
begin
  delete from public.items where id = '00000000-0000-0000-0000-0000000000a1';
  if exists (select 1 from public.tutor_conversation_rules) then
    raise exception 'a deleted rule kept its link';
  end if;
  delete from public.tutor_conversations;
  if exists (select 1 from public.tutor_exchanges) then
    raise exception 'a deleted conversation kept its exchanges';
  end if;
end $$;

-- anon can do nothing.
set local role anon;
do $$
begin
  begin
    perform 1 from public.tutor_conversations;
    raise exception 'anon read conversations';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.search_tutor('mit', null, 10);
    raise exception 'anon ran search_tutor';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
