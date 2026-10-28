-- ====================================================================
-- layercents: initial schema (accounts, sync, printer fleet, billing)
--
-- Design and reasons: docs/NUBE.md. Tested by supabase/rls.test.js.
--
-- Three rules this file follows everywhere:
--
-- 1. Row Level Security (RLS) is ON in every table. With RLS on and no
--    policy, nobody sees anything; each policy then opens exactly what a
--    person may touch. The web app's `anon key` is public by design, so
--    RLS is the only thing between one user and another user's rows.
--
-- 2. Supabase grants ALL privileges on new tables to the roles `anon`
--    and `authenticated` by default. Here every table starts with a
--    REVOKE ALL and then grants back only what is needed, so forgetting
--    a policy can't expose a table. (RLS and grants are two separate
--    locks; both must allow a request.)
--
-- 3. Data that must not be forged by a user (printer status, jobs,
--    subscriptions) is written only by Edge Functions with the
--    `service_role` key, which bypasses RLS. The web can read it, never
--    write it.
-- ====================================================================

-- Pairing codes ("device flow") and the Edge Functions use these.
create extension if not exists pgcrypto;

-- --------------------------------------------------------------------
-- quotes: one saved quote, as the web's `savedQuotes` array holds it.
-- --------------------------------------------------------------------
create table public.quotes (
  user_id        uuid        not null references auth.users (id) on delete cascade,
  -- The web's own id (Date.now() when it was saved). Unique per user, so
  -- the same quote uploaded from two devices is one row, not two.
  id             bigint      not null,
  payload        jsonb       not null check (octet_length(payload::text) <= 200000),
  -- Version of the payload's shape (backup.js BACKUP_SCHEMA_VERSION), so
  -- a future app can migrate rows written by an older one.
  schema_version integer     not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- A tombstone, not a DELETE: with two devices, a deleted row that simply
  -- disappears looks like "this device never had it" and comes back on the
  -- next sync. The mark travels like any other change.
  deleted_at     timestamptz,
  primary key (user_id, id)
);

-- --------------------------------------------------------------------
-- business: the data printed on customer quotes (one row per user).
-- --------------------------------------------------------------------
create table public.business (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  -- Includes the logo as a data URL; 480x200 PNG is far below this.
  payload    jsonb       not null check (octet_length(payload::text) <= 500000),
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------------------------
-- agents: one local agent linked to an account.
-- --------------------------------------------------------------------
create table public.agents (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  name         text        not null check (char_length(name) between 1 and 60),
  -- SHA-256 of the agent's token. The token itself exists only on the
  -- agent's computer: a database leak must not let anyone impersonate it.
  token_hash   text        not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at   timestamptz
);

-- --------------------------------------------------------------------
-- printers: what the agent reports about each printer. Never an IP,
-- serial number or access code: those never leave the person's computer.
-- --------------------------------------------------------------------
create table public.printers (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references auth.users (id) on delete cascade,
  agent_id uuid not null references public.agents (id) on delete cascade,
  -- The id the agent uses in its own config ("p1s-taller").
  local_id text not null check (local_id ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  name     text not null check (char_length(name) between 1 and 60),
  brand    text not null check (char_length(brand) between 1 and 30),
  model    text check (char_length(model) <= 30),
  unique (agent_id, local_id)
);

-- --------------------------------------------------------------------
-- printer_status: the latest status of each printer (one row, replaced).
-- --------------------------------------------------------------------
create table public.printer_status (
  printer_id uuid        primary key references public.printers (id) on delete cascade,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  status     jsonb       not null check (octet_length(status::text) <= 10000),
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------------------------
-- jobs: the agent's job log (agent/jobs.js), mirrored to the account.
-- --------------------------------------------------------------------
create table public.jobs (
  printer_id        uuid        not null references public.printers (id) on delete cascade,
  -- The agent's job id: stable, so re-sending a job updates it, not duplicates it.
  job_id            text        not null check (char_length(job_id) <= 100),
  user_id           uuid        not null references auth.users (id) on delete cascade,
  name              text        check (char_length(name) <= 200),
  started_at        timestamptz not null,
  started_approx    boolean     not null default false,
  ended_at          timestamptz,
  outcome           text        check (outcome in ('finished', 'failed', 'unknown')),
  estimated_minutes numeric     check (estimated_minutes >= 0),
  -- Null when the start was estimated: a guess is never stored as a measurement.
  real_minutes      numeric     check (real_minutes >= 0),
  total_layers      integer     check (total_layers >= 0),
  print_error       bigint,
  primary key (printer_id, job_id),
  -- A job is open (no end, no outcome) or closed (both).
  constraint jobs_open_or_closed check ((ended_at is null) = (outcome is null)),
  constraint jobs_end_after_start check (ended_at is null or ended_at >= started_at),
  constraint jobs_real_needs_measured_start check (real_minutes is null or not started_approx)
);
create index jobs_user_started_idx on public.jobs (user_id, started_at desc);

-- --------------------------------------------------------------------
-- subscriptions: the plan, copied from the payment provider's webhook.
-- Only the webhook function writes it (see docs/NUBE.md).
-- --------------------------------------------------------------------
create table public.subscriptions (
  user_id                  uuid        primary key references auth.users (id) on delete cascade,
  provider                 text        not null check (provider in ('lemonsqueezy', 'paddle')),
  provider_customer_id     text,
  provider_subscription_id text,
  plan                     text        not null check (char_length(plan) <= 40),
  status                   text        not null check (status in ('trialing', 'active', 'past_due', 'cancelled', 'expired')),
  current_period_end       timestamptz,
  updated_at               timestamptz not null default now()
);

-- --------------------------------------------------------------------
-- pairings: "device flow" codes that link an agent to an account.
-- Nobody but the Edge Functions touches this table (no grants, no policies).
-- --------------------------------------------------------------------
create table public.pairings (
  -- SHA-256 of the long secret code only the agent knows.
  device_code_hash text        primary key check (device_code_hash ~ '^[0-9a-f]{64}$'),
  -- The short code the person types on the web (K7QX-M2PD).
  user_code        text        not null unique check (user_code ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  agent_name       text        not null check (char_length(agent_name) between 1 and 60),
  -- Set when a signed-in person types the user code.
  user_id          uuid        references auth.users (id) on delete cascade,
  expires_at       timestamptz not null,
  created_at       timestamptz not null default now(),
  consumed_at      timestamptz
);

-- ====================================================================
-- Triggers
-- ====================================================================

-- Keeps updated_at honest: set by the database, never by the client's clock.
create function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger quotes_touch   before update on public.quotes   for each row execute function public.touch_updated_at();
create trigger business_touch before update on public.business for each row execute function public.touch_updated_at();

-- A revoked agent stays revoked: otherwise a stolen token that was revoked
-- could be revived by whoever has the person's session. Re-linking makes a new agent.
create function public.agents_keep_revoked() returns trigger
language plpgsql as $$
begin
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'a revoked agent cannot be reactivated' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger agents_keep_revoked before update on public.agents for each row execute function public.agents_keep_revoked();

-- Defence in depth: the Edge Function also limits this, but a bug there
-- must not let one account fill the table.
create function public.printers_limit() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.printers where user_id = new.user_id) >= 20 then
    raise exception 'printer limit reached for this account' using errcode = '54000';
  end if;
  return new;
end;
$$;
create trigger printers_limit before insert on public.printers for each row execute function public.printers_limit();

-- ====================================================================
-- Privileges (lock 1) and RLS policies (lock 2)
-- ====================================================================
revoke all on public.quotes, public.business, public.agents, public.printers,
              public.printer_status, public.jobs, public.subscriptions, public.pairings
  from anon, authenticated;

alter table public.quotes         enable row level security;
alter table public.business       enable row level security;
alter table public.agents         enable row level security;
alter table public.printers       enable row level security;
alter table public.printer_status enable row level security;
alter table public.jobs           enable row level security;
alter table public.subscriptions  enable row level security;
alter table public.pairings       enable row level security;

-- quotes and business: a person has full control of their own rows.
-- `(select auth.uid())` instead of `auth.uid()`: Postgres evaluates it once
-- per query and not once per row, which matters with thousands of quotes.
grant select, insert, update, delete on public.quotes   to authenticated;
grant select, insert, update, delete on public.business to authenticated;

create policy quotes_own on public.quotes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));   -- also stops "moving" a row to another user

create policy business_own on public.business
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- agents: read your own (never the token hash), rename, revoke. Creation
-- and last_seen_at belong to the Edge Functions.
grant select (id, user_id, name, created_at, last_seen_at, revoked_at) on public.agents to authenticated;
grant update (name, revoked_at) on public.agents to authenticated;

create policy agents_read   on public.agents for select to authenticated using (user_id = (select auth.uid()));
create policy agents_update on public.agents for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- printers, status, jobs, subscriptions: read your own. No write grants at all.
grant select on public.printers, public.printer_status, public.jobs, public.subscriptions to authenticated;

create policy printers_read       on public.printers       for select to authenticated using (user_id = (select auth.uid()));
create policy printer_status_read on public.printer_status for select to authenticated using (user_id = (select auth.uid()));
create policy jobs_read           on public.jobs           for select to authenticated using (user_id = (select auth.uid()));
create policy subscriptions_read  on public.subscriptions  for select to authenticated using (user_id = (select auth.uid()));

-- pairings: no grants and no policies on purpose. Only service_role gets in.

-- The web follows printer status live (Supabase Realtime). The publication
-- exists on Supabase; the guard lets this file also run on a plain Postgres.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.printer_status;
  end if;
end;
$$;
