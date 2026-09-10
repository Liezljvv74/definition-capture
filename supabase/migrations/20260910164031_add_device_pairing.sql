-- Signing in a second device from one that is already signed in, without an
-- email. A signed-in browser writes a short-lived pairing here; the other
-- device hands the code to the `pair` Edge Function, which is the only thing
-- that can read this table and which mints that device its own session.
--
-- What is deliberately *not* here is any session token. Passing an access or
-- refresh token through a row would mean the row is the account: anyone who
-- read it would be signed in as its owner, and there is no way to take that
-- back. Instead the row is a claim ticket, and Supabase issues the second
-- device a fresh session of its own.
--
-- Only the hash of the code is stored, so the table never holds the thing
-- someone would need in order to use it.

create table public.device_pairings (
  -- sha-256 of the code, hex. The code itself is shown once, on screen.
  code_hash text primary key,

  user_id uuid not null references auth.users (id) on delete cascade,

  created_at timestamptz not null default now(),

  -- Long enough to type a code across the room, short enough that a forgotten
  -- one stops being useful almost immediately.
  expires_at timestamptz not null default now() + interval '5 minutes',

  -- Set the moment it is redeemed, so a code works exactly once.
  claimed_at timestamptz,

  constraint device_pairings_code_hash_shape check (code_hash ~ '^[0-9a-f]{64}$')
);

create index device_pairings_expires_at_idx on public.device_pairings (expires_at);

/* ------------------------------------------------------ row level security */

alter table public.device_pairings enable row level security;

-- A signed-in browser may create a pairing for itself, and that is all. There
-- is deliberately no select, update, or delete policy: nothing running in a
-- browser can read a pairing back, not even the one that wrote it, so a code
-- cannot be recovered from anywhere except the screen it was shown on. The
-- Edge Function uses the service role and bypasses this entirely.
create policy "Users create their own pairings"
  on public.device_pairings for insert to authenticated
  with check ((select auth.uid()) = user_id);
