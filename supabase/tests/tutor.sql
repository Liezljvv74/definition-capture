-- Rehearses the tutor's plan and usage tables and the new settings columns.
-- One transaction, rolled back; each `do` block raises on a wrong answer.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test');
insert into public.user_settings (user_id) values
  ('00000000-0000-0000-0000-00000000000a');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
begin
  if exists (select 1 from public.account_plans) then
    raise exception 'A sees a plan row before one exists';
  end if;
  begin
    insert into public.account_plans (user_id, plan) values ('00000000-0000-0000-0000-00000000000a', 'paid');
    raise exception 'A upgraded themselves';
  exception when insufficient_privilege then null;
  end;
end $$;

-- An administrator marks A paid.
reset role;
insert into public.account_plans (user_id, plan) values ('00000000-0000-0000-0000-00000000000a', 'paid');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
begin
  if (select plan from public.account_plans) is distinct from 'paid' then
    raise exception 'A cannot read their paid plan';
  end if;
  begin
    update public.account_plans set plan = 'free';
    raise exception 'A updated a plan';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.account_plans;
    raise exception 'A deleted a plan';
  exception when insufficient_privilege then null;
  end;

  insert into public.tutor_usage (user_id) values ('00000000-0000-0000-0000-00000000000a');
  begin
    insert into public.tutor_usage (user_id) values ('00000000-0000-0000-0000-00000000000b');
    raise exception 'A wrote usage for B';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.tutor_usage set created_at = now() - interval '2 days';
    raise exception 'A updated usage';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.tutor_usage;
    raise exception 'A deleted usage';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.user_settings set level = 'D1';
    raise exception 'level D1 accepted';
  exception when check_violation then null;
  end;
  begin
    update public.user_settings set native_language = 'de', native_language_other = 'x';
    raise exception 'both native language columns accepted';
  exception when check_violation then null;
  end;
  update public.user_settings set native_language = 'de', level = 'B1';
end $$;

-- B sees none of A's rows.
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';
do $$
begin
  if exists (select 1 from public.account_plans) or exists (select 1 from public.tutor_usage) then
    raise exception 'B sees A''s plan or usage';
  end if;
end $$;

rollback;
