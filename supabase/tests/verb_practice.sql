-- Rehearses verb practice against the local copy: the shared schedule,
-- record_tense_review, its refusals, RLS, and home_summary's verb counts.
-- One transaction, rolled back; each `do` block raises on a wrong answer.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'v1@example.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'v2@example.test');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}';

-- A verb with two filled tenses and one empty column, and a word.
insert into public.items (id, user_id, item_type, title, tenses, verb_rows) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', 'verb_table', 'gehen',
   array['Präsens', 'Perfekt', 'Futur'],
   '[{"person":"ich","conjugations":["gehe","bin gegangen",""],"notes":""},
     {"person":"du","conjugations":["gehst","",""],"notes":""}]'::jsonb);
insert into public.items (id, user_id, item_type, title, definition) values
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000f1', 'word', 'Hund', 'dog');

do $$
declare s record;
begin
  select * into s from public.home_summary();
  -- Futur has no forms, so two tenses count; the verb is new.
  if s.verb_tenses_new <> 2 or s.verb_tenses_due <> 0 or s.verbs_new <> 1
     or s.verbs_learning <> 0 or s.verbs_learned <> 0 or s.new_items <> 1 then
    raise exception 'fresh verb counts are wrong: %', s;
  end if;
end $$;

-- record_review behaves as before: 1, 6, then interval * ease, capped.
do $$
declare r public.progress;
begin
  r := public.record_review('20000000-0000-0000-0000-000000000002', 'correct');
  if r.interval_days <> 1 or r.streak <> 1 then raise exception 'first correct: %', r; end if;
  r := public.record_review('20000000-0000-0000-0000-000000000002', 'correct');
  if r.interval_days <> 6 or r.streak <> 2 then raise exception 'second correct: %', r; end if;
  r := public.record_review('20000000-0000-0000-0000-000000000002', 'correct');
  if r.interval_days <> 16 or r.ease <> 2.80 then raise exception 'third correct: %', r; end if;
  r := public.record_review('20000000-0000-0000-0000-000000000002', 'again');
  if r.interval_days <> 0 or r.streak <> 0 or r.lapses <> 1 or r.ease <> 2.60 then
    raise exception 'a miss: %', r;
  end if;
end $$;

-- Präsens right twice (learned), Perfekt missed: the verb is learning.
do $$
declare v public.verb_tense_progress; s record;
begin
  v := public.record_tense_review('20000000-0000-0000-0000-000000000001', 'Präsens', 'correct');
  v := public.record_tense_review('20000000-0000-0000-0000-000000000001', 'Präsens', 'correct');
  if v.streak <> 2 or v.interval_days <> 6 then raise exception 'Präsens: %', v; end if;
  v := public.record_tense_review('20000000-0000-0000-0000-000000000001', 'Perfekt', 'again');
  if v.streak <> 0 or v.lapses <> 1 then raise exception 'Perfekt: %', v; end if;
  if (select count(*) from public.reviews where tense = 'Präsens') <> 2 then
    raise exception 'reviews do not carry the tense';
  end if;
  select * into s from public.home_summary();
  if s.verbs_learning <> 1 or s.verbs_learned <> 0 or s.verb_tenses_due <> 1 or s.verb_tenses_new <> 0 then
    raise exception 'learning verb counts are wrong: %', s;
  end if;
end $$;

-- Perfekt right twice: the verb is learned. Then Futur gets a form: the verb
-- is learning again and Futur is new.
do $$
declare s record;
begin
  perform public.record_tense_review('20000000-0000-0000-0000-000000000001', 'Perfekt', 'correct');
  perform public.record_tense_review('20000000-0000-0000-0000-000000000001', 'Perfekt', 'correct');
  select * into s from public.home_summary();
  if s.verbs_learned <> 1 or s.verbs_learning <> 0 then raise exception 'not learned: %', s; end if;

  update public.items
  set verb_rows = '[{"person":"ich","conjugations":["gehe","bin gegangen","werde gehen"],"notes":""},
                    {"person":"du","conjugations":["gehst","",""],"notes":""}]'::jsonb
  where id = '20000000-0000-0000-0000-000000000001';
  select * into s from public.home_summary();
  if s.verbs_learned <> 0 or s.verbs_learning <> 1 or s.verb_tenses_new <> 1 then
    raise exception 'a new tense did not reopen the verb: %', s;
  end if;
end $$;

-- Refusals: an unknown answer, a word instead of a verb table.
do $$
begin
  begin
    perform public.record_tense_review('20000000-0000-0000-0000-000000000001', 'Präsens', 'maybe');
    raise exception 'an unknown answer was accepted';
  exception when raise_exception then
    if sqlerrm not like 'unknown answer%' then raise; end if;
  end;
  begin
    perform public.record_tense_review('20000000-0000-0000-0000-000000000002', 'Präsens', 'correct');
    raise exception 'a word was accepted as a verb table';
  exception when raise_exception then
    if sqlerrm <> 'not your verb table' then raise; end if;
  end;
  begin
    perform public.record_tense_review('20000000-0000-0000-0000-000000000001', '  ', 'correct');
    raise exception 'an unnamed tense was accepted';
  exception when raise_exception then
    if sqlerrm <> 'no tense' then raise; end if;
  end;
  begin
    perform public.record_tense_review('20000000-0000-0000-0000-000000000001', 'Plusquamperfekt', 'correct');
    raise exception 'a tense the table lacks was accepted';
  exception when raise_exception then
    if sqlerrm <> 'not a tense of this table' then raise; end if;
  end;
end $$;

-- Two columns of the same name count once.
do $$
declare s record;
begin
  -- Futur is not tried yet, so a double count would show as two new tenses.
  update public.items
  set tenses = array['Präsens', 'Perfekt', 'Futur', 'Futur'],
      verb_rows = '[{"person":"ich","conjugations":["gehe","bin gegangen","werde gehen","werde gehen"],"notes":""}]'::jsonb
  where id = '20000000-0000-0000-0000-000000000001';
  select * into s from public.home_summary();
  if s.verb_tenses_new <> 1 then
    raise exception 'a repeated tense was counted twice: %', s;
  end if;
end $$;

-- Another account sees none of it and cannot record against it.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}';
do $$
begin
  if exists (select 1 from public.verb_tense_progress) then
    raise exception 'another account can read verb tense progress';
  end if;
  begin
    perform public.record_tense_review('20000000-0000-0000-0000-000000000001', 'Präsens', 'correct');
    raise exception 'another account recorded a tense';
  exception when raise_exception then
    if sqlerrm <> 'not your verb table' then raise; end if;
  end;
end $$;

rollback;
