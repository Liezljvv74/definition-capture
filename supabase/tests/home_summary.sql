-- Rehearses home_summary and build_deck(only_due) against the local copy.
-- Everything happens inside one transaction that is rolled back, so it can be
-- run any number of times. Each `do` block raises on a wrong answer.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test');

set local role authenticated;

-- An empty account: every count is zero and nothing is picked.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';
do $$
declare s record;
begin
  select * into s from public.home_summary();
  if s.words <> 0 or s.due <> 0 or s.new_items <> 0 or s.remember_id is not null
     or s.last_saved_at is not null then
    raise exception 'empty account is not empty: %', s;
  end if;
end $$;

-- Account A: a word with a definition that is due, a learned word, a new
-- phrase, and a word with no definition.
insert into public.items (id, user_id, item_type, title, definition) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'word', 'due-word', 'x'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'word', 'learned-word', 'y'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 'word', 'bare-word', '');
insert into public.items (id, user_id, item_type, title, literal_meaning, usage_example) values
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000a', 'phrase', 'new-phrase', 'z', '');
insert into public.progress (item_id, user_id, streak, due_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 1, now() - interval '1 day'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 2, now() + interval '3 days');

do $$
declare s record;
begin
  select * into s from public.home_summary();
  if s.words <> 3 or s.words_without_definition <> 1 or s.phrases <> 1
     or s.due <> 1 or s.new_items <> 1 or s.learning <> 1 or s.learned <> 1
     or s.next_due_at is null or s.remember_id is null then
    raise exception 'populated account counted wrong: %', s;
  end if;
end $$;

-- A due-only deck holds exactly the one due item.
do $$
declare deck uuid; n integer; first uuid;
begin
  deck := public.build_deck(only_due => true);
  select count(*), min(item_id::text)::uuid into n, first from public.deck_cards where deck_id = deck;
  if n <> 1 or first <> '10000000-0000-0000-0000-000000000001' then
    raise exception 'due-only deck is wrong: % cards, first %', n, first;
  end if;
end $$;

-- Account B sees none of A's rows.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
declare s record;
begin
  select * into s from public.home_summary();
  if s.words <> 0 or s.remember_id is not null then
    raise exception 'account B can see account A: %', s;
  end if;
end $$;

rollback;
