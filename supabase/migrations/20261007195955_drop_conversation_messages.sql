-- The Conversations page and its route are gone from production (PR #50,
-- Docs/tutor-conversations.md), so nothing reads this table any more; its rows
-- were deleted by 20261007122134_tutor_conversations.sql. Dropped once the
-- deploy was live, as planned. From here a Vercel rollback to a deployment
-- from before that release would fail on the missing table: roll forward.

drop table public.conversation_messages;

do $$
begin
  if to_regclass('public.conversation_messages') is not null then
    raise exception 'conversation_messages is still there';
  end if;
end;
$$;
