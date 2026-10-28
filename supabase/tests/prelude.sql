-- ONLY for tests on a plain Postgres. Supabase already has all of this.
-- It recreates the parts the migration relies on, the way Supabase has them:
-- the three API roles, auth.users, auth.uid(), and the default privilege that
-- gives every new table to anon and authenticated (which the migration must undo).
-- Roles belong to the whole Postgres server, not to one database, so a second
-- test run would find them already there: create them only if missing.
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end;
$$;

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
-- Supabase reads the user id from the request's JWT; here it comes from a setting.
create function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
