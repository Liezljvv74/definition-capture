-- Rehearses home_summary and build_deck(only_due) against the local copy.
-- Everything happens inside one transaction that is rolled back, so it can be
-- run any number of times. Each `do` block raises on a wrong answer.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test'),
  ('00000000-0000-0000-0000-00000000000c', 'c@example.test'),
  ('00000000-0000-0000-0000-00000000000d', 'd@example.test');

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

-- Account C: the remember card draws only difficult words of five letters or
-- more. Existing assertions above are unchanged: account A's remember_id is
-- still non-null because 'due-word' is a long, not-yet-learned word.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}';
insert into public.items (id, user_id, item_type, title, definition) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'word', 'sie', 'short');
insert into public.items (id, user_id, item_type, title, literal_meaning, usage_example) values
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c', 'phrase', 'a long new phrase', 'z', '');
insert into public.progress (item_id, user_id, times_seen, times_correct, streak, lapses) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 4, 1, 0, 2);

-- A three-letter word with lapses and a phrase are never picked.
do $$
begin
  if (select remember_id from public.home_summary()) is not null then
    raise exception 'a short word or a phrase was picked';
  end if;
end $$;

-- A learned word (streak 3, no lapses, 100%) is never picked: expect null.
insert into public.items (id, user_id, item_type, title, definition) values
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000c', 'word', 'learned-long', 'y');
insert into public.progress (item_id, user_id, times_seen, times_correct, streak, lapses) values
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000c', 3, 3, 3, 0);
do $$
begin
  if (select remember_id from public.home_summary()) is not null then
    raise exception 'a learned word was picked';
  end if;
end $$;

-- With no hard word, a new word is picked.
insert into public.items (id, user_id, item_type, title, definition) values
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000c', 'word', 'fresh-word', 'n');
do $$
begin
  if (select remember_id from public.home_summary()) is distinct from '20000000-0000-0000-0000-000000000004' then
    raise exception 'the new word was not picked';
  end if;
end $$;

-- A hard word always beats a new one: 20 draws, every one the hard word.
insert into public.items (id, user_id, item_type, title, definition) values
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000c', 'word', 'hard-word', 'h');
insert into public.progress (item_id, user_id, times_seen, times_correct, streak, lapses) values
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000c', 5, 2, 0, 1);
do $$
begin
  for i in 1..20 loop
    if (select remember_id from public.home_summary()) is distinct from '20000000-0000-0000-0000-000000000005' then
      raise exception 'draw %: the hard word was not picked', i;
    end if;
  end loop;
end $$;

-- The accuracy-only arm: an account whose only hard word has streak 2, no
-- lapses and 3 of 5 right must beat a new word on every draw. A word with
-- times_seen = 0 sits beside them to exercise the division-free comparison.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000d","role":"authenticated"}';
insert into public.items (id, user_id, item_type, title, definition) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000d', 'word', 'accuracy-word', 'a'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000d', 'word', 'unseen-word', 'b'),
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000d', 'word', 'brand-new-word', 'c');
insert into public.progress (item_id, user_id, times_seen, times_correct, streak, lapses) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000d', 5, 3, 2, 0),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000d', 0, 0, 0, 0);
do $$
begin
  for i in 1..20 loop
    if (select remember_id from public.home_summary()) is distinct from '30000000-0000-0000-0000-000000000001' then
      raise exception 'draw %: the low-accuracy word was not picked', i;
    end if;
  end loop;
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
