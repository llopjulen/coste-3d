-- ==================================================================
-- Tests del núcleo del taller (docs/TALLER.md): talleres, miembros,
-- invitaciones, y los dos primeros datos de un taller (presupuestos
-- y datos del negocio).
--
-- Se ejecutan con `supabase test db` (pgTAP). Cada archivo corre en una
-- transacción que acaba en ROLLBACK: no deja nada en la base de datos.
--
-- Qué protegen, por orden de gravedad:
--   1. Aislamiento entre talleres: nadie ve, edita ni borra datos de un
--      taller del que no es miembro.
--   2. Roles: el operario no ve nada de finanzas; solo el jefe administra
--      el taller (nombre, borrado, invitaciones).
--   3. Que ningún rol de la web puede darse permisos a sí mismo: las
--      altas, bajas y cambios de rol son de funciones, no de la web.
--   4. Que las funciones de seguridad están blindadas (security definer
--      con search_path vacío, que es lo que evita la recursión y los
--      secuestros de esquema).
--   5. Integridad y ciclo de vida: un solo jefe, borrar cuentas y talleres.
--
-- Cómo se hace pasar por una persona: como hace Supabase con cada
-- petición. Se cambia al rol `authenticated` y se pone el JWT en
-- `request.jwt.claims`; auth.uid() lee el `sub` de ahí. `set local`
-- dura hasta el final de la transacción o hasta el siguiente `set local`.
--
-- Cinco personas y dos talleres:
--   A jefe de Taller 1 · M encargado de Taller 1 · O operario de Taller 1
--   B jefe de Taller 2 · Z sin taller (todavía)
-- ==================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(95);

-- Intenta una escritura y se traga el error: se comprueba después el
-- ESTADO (no cambió nada). Sirve para el caso en que RLS esconde las filas
-- y el UPDATE/DELETE "funciona" tocando 0 filas, o falla; da igual cómo,
-- lo que importa es que no cambie nada.
create function pg_temp.attempt(q text) returns text language plpgsql as $f$
begin execute q; return 'ok';
exception when others then return sqlstate;
end
$f$;

create temp table fx (k text primary key, v text) on commit drop;
grant all on fx to authenticated, anon;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@test.local'),
  ('22222222-2222-4222-8222-222222222222', 'm@test.local'),
  ('33333333-3333-4333-8333-333333333333', 'o@test.local'),
  ('44444444-4444-4444-8444-444444444444', 'b@test.local'),
  ('55555555-5555-4555-8555-555555555555', 'z@test.local');

insert into public.workspaces (id, name, owner_id) values
  ('a1000000-0000-4000-8000-000000000001', 'Taller A', '11111111-1111-4111-8111-111111111111'),
  ('a2000000-0000-4000-8000-000000000002', 'Taller B', '44444444-4444-4444-8444-444444444444');
insert into public.memberships (workspace_id, user_id, role) values
  ('a1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('a1000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'manager'),
  ('a1000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'operator'),
  ('a2000000-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444', 'owner');
insert into public.invitations (workspace_id, email, role, token_hash, invited_by, expires_at) values
  ('a1000000-0000-4000-8000-000000000001', 'nuevo@test.local', 'operator', repeat('a', 64),
   '11111111-1111-4111-8111-111111111111', now() + interval '7 days');

-- ------------------------------------------------------------------
-- 1. Estructura: RLS activado, funciones, y funciones blindadas
-- ------------------------------------------------------------------
select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.workspaces')), false), 'RLS activado en workspaces');
select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.memberships')), false), 'RLS activado en memberships');
select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.invitations')), false), 'RLS activado en invitations');
select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.quotes')), false), 'RLS activado en quotes');
select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.business')), false), 'RLS activado en business');
select has_function('public', 'is_member', array['uuid'], 'existe is_member(uuid)');
select has_function('public', 'has_role', array['uuid', 'text[]'], 'existe has_role(uuid, text[])');
select has_function('public', 'create_workspace', array['text'], 'existe create_workspace(text)');
-- is_member y has_role leen memberships saltándose RLS: si no, la política de
-- memberships se llamaría a sí misma sin fin (recursión infinita).
select is_definer('public', 'is_member', array['uuid'], 'is_member es security definer (rompe la recursión de RLS)');
select is_definer('public', 'has_role', array['uuid', 'text[]'], 'has_role es security definer');
select isnt_definer('public', 'create_workspace', array['text'], 'create_workspace es security invoker: RLS se aplica dentro');
-- Un security definer sin search_path fijo se puede secuestrar creando un
-- objeto con el mismo nombre en un esquema que la función mire antes.
select ok(coalesce((select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.is_member(uuid)'::regprocedure), false), 'is_member fija search_path vacío');
select ok(coalesce((select proconfig @> array['search_path=""'] from pg_proc where oid = 'public.has_role(uuid, text[])'::regprocedure), false), 'has_role fija search_path vacío');
select is((select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity), 0, 'ninguna tabla de public se queda sin RLS');

-- ------------------------------------------------------------------
-- 2. is_member y has_role dicen la verdad para cada persona
-- ------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(public.is_member('a1000000-0000-4000-8000-000000000001'), true, 'A es miembro de su taller');
select is(public.has_role('a1000000-0000-4000-8000-000000000001', array['owner']), true, 'A es jefe');
select is(public.has_role('a1000000-0000-4000-8000-000000000001', array['owner', 'manager']), true, 'A tiene rol de finanzas');
select is(public.is_member('a2000000-0000-4000-8000-000000000002'), false, 'A no es miembro del taller de B');

set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(public.is_member('a1000000-0000-4000-8000-000000000001'), true, 'M es miembro');
select is(public.has_role('a1000000-0000-4000-8000-000000000001', array['owner']), false, 'M no es jefe');
select is(public.has_role('a1000000-0000-4000-8000-000000000001', array['owner', 'manager']), true, 'M tiene rol de finanzas');

set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(public.is_member('a1000000-0000-4000-8000-000000000001'), true, 'O es miembro');
select is(public.has_role('a1000000-0000-4000-8000-000000000001', array['owner', 'manager']), false, 'O no tiene rol de finanzas');

set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select is(public.is_member('a1000000-0000-4000-8000-000000000001'), false, 'Z, sin taller, no es miembro');
select is(public.has_role('a1000000-0000-4000-8000-000000000001', array['owner', 'manager', 'operator']), false, 'Z no tiene ningún rol en el taller de A');

-- ------------------------------------------------------------------
-- 3. Talleres: quién ve, quién renombra, quién cambia el dueño
-- ------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select count(*)::int from public.workspaces), 1, 'O ve solo su taller, no el de B');
do $$ begin perform pg_temp.attempt($q$ update public.workspaces set name = 'Mio' where id = 'a1000000-0000-4000-8000-000000000001' $q$); end $$;
select is((select name from public.workspaces where id = 'a1000000-0000-4000-8000-000000000001'), 'Taller A', 'el operario no puede renombrar el taller');

set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
do $$ begin perform pg_temp.attempt($q$ update public.workspaces set name = 'Del encargado' where id = 'a1000000-0000-4000-8000-000000000001' $q$); end $$;
select is((select name from public.workspaces where id = 'a1000000-0000-4000-8000-000000000001'), 'Taller A', 'el encargado tampoco: administrar el taller es del jefe');

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$ update public.workspaces set name = 'Taller A2' where id = 'a1000000-0000-4000-8000-000000000001' $$, 'el jefe puede renombrar su taller');
select is((select name from public.workspaces where id = 'a1000000-0000-4000-8000-000000000001'), 'Taller A2', 'y el nombre cambia');
select throws_ok($$ update public.workspaces set owner_id = '44444444-4444-4444-8444-444444444444' where id = 'a1000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'ni el jefe cambia el dueño con un update: el traspaso es cosa de una función');

set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select is((select count(*)::int from public.workspaces), 0, 'Z no ve ningún taller');
select throws_ok($$ insert into public.workspaces (name, owner_id) values ('Intruso', '44444444-4444-4444-8444-444444444444') $$,
  '42501', null, 'nadie crea un taller a nombre de otra persona');

-- ------------------------------------------------------------------
-- 4. Miembros: se leen, pero la web no da altas, bajas ni cambios de rol
-- ------------------------------------------------------------------
select throws_ok($$ insert into public.memberships (workspace_id, user_id, role) values ('a1000000-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555', 'manager') $$,
  '42501', null, 'nadie se mete solo en un taller ajeno como encargado');
select throws_ok($$ insert into public.memberships (workspace_id, user_id, role) values ('a1000000-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555', 'owner') $$,
  '42501', null, 'ni como jefe');

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$ insert into public.memberships (workspace_id, user_id, role) values ('a1000000-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444', 'operator') $$,
  '42501', null, 'ni el jefe da de alta a alguien con un insert: las altas son por invitación');

set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select count(*)::int from public.memberships), 3, 'un miembro ve quién más hay en su taller');
-- Se intenta ascender a 'manager' y no a 'owner': ascender a jefe ya lo frena el
-- índice de un solo jefe y el test pasaría por la razón equivocada. 'manager' es la
-- escalada real: daría acceso a todas las finanzas.
do $$ begin perform pg_temp.attempt($q$ update public.memberships set role = 'manager' where user_id = '33333333-3333-4333-8333-333333333333' $q$); end $$;
select is((select role from public.memberships where user_id = '33333333-3333-4333-8333-333333333333'), 'operator', 'el operario no se asciende a sí mismo');

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
do $$ begin perform pg_temp.attempt($q$ delete from public.memberships where user_id = '33333333-3333-4333-8333-333333333333' $q$); end $$;
select is((select count(*)::int from public.memberships), 3, 'el jefe no quita miembros con un delete: lo hace una función');

set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select is((select count(*)::int from public.memberships), 1, 'B solo ve a los de su taller');

reset role;
select throws_ok($$ insert into public.memberships (workspace_id, user_id, role) values ('a1000000-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555', 'owner') $$,
  '23505', null, 'un taller no puede tener dos jefes');
select throws_ok($$ insert into public.memberships (workspace_id, user_id, role) values ('a1000000-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555', 'boss') $$,
  '23514', null, 'un rol inventado se rechaza');

-- ------------------------------------------------------------------
-- 5. Invitaciones: las lee el jefe, sin el hash del token; las escriben funciones
-- ------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*)::int from public.invitations), 1, 'el jefe ve las invitaciones de su taller');
select throws_ok('select token_hash from public.invitations', '42501', null, 'la web no puede leer el hash del token');
select throws_ok('select * from public.invitations', '42501', null, 'ni con select * (incluye la columna oculta)');
select throws_ok($$ insert into public.invitations (workspace_id, email, role, token_hash, expires_at) values ('a1000000-0000-4000-8000-000000000001', 'x@test.local', 'operator', repeat('b', 64), now() + interval '1 day') $$,
  '42501', null, 'la web no crea invitaciones: lo hace una función que comprueba los asientos');
do $$ begin perform pg_temp.attempt($q$ update public.invitations set revoked_at = now() $q$); end $$;
select is((select count(*)::int from public.invitations where revoked_at is not null), 0, 'ni las revoca: también es de una función');

set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.invitations), 0, 'el encargado no ve invitaciones');
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select count(*)::int from public.invitations), 0, 'el operario tampoco');

reset role;
select throws_ok($$ insert into public.invitations (workspace_id, email, role, token_hash, expires_at) values ('a1000000-0000-4000-8000-000000000001', 'jefe@test.local', 'owner', repeat('c', 64), now() + interval '1 day') $$,
  '23514', null, 'nadie se invita como jefe');
select throws_ok($$ insert into public.invitations (workspace_id, email, role, token_hash, expires_at) values ('a1000000-0000-4000-8000-000000000001', 'NUEVO@test.local', 'manager', repeat('d', 64), now() + interval '1 day') $$,
  '23505', null, 'una sola invitación abierta por correo y taller, sin distinguir mayúsculas');
select throws_ok($$ insert into public.invitations (workspace_id, email, role, token_hash, expires_at) values ('a1000000-0000-4000-8000-000000000001', 'otro@test.local', 'manager', 'no-es-un-hash', now() + interval '1 day') $$,
  '23514', null, 'el token se guarda hasheado (64 hex): uno en claro se rechaza');

-- ------------------------------------------------------------------
-- 6. Presupuestos (finanzas): jefe y encargado sí, operario no
-- ------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$ insert into public.quotes (workspace_id, id, payload) values ('a1000000-0000-4000-8000-000000000001', 1, '{"pieceName":"Soporte"}') $$, 'el jefe guarda un presupuesto');
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select lives_ok($$ insert into public.quotes (workspace_id, id, payload) values ('a1000000-0000-4000-8000-000000000001', 2, '{"pieceName":"Llavero"}') $$, 'el encargado también');
select is((select count(*)::int from public.quotes), 2, 'el encargado ve los presupuestos de todo el taller');

set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select count(*)::int from public.quotes), 0, 'el operario no ve ningún presupuesto (llevan precios y costes)');
select throws_ok($$ insert into public.quotes (workspace_id, id, payload) values ('a1000000-0000-4000-8000-000000000001', 3, '{}') $$,
  '42501', null, 'el operario no escribe presupuestos');

set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select is((select count(*)::int from public.quotes), 0, 'B no ve los presupuestos de otro taller');
select throws_ok($$ insert into public.quotes (workspace_id, id, payload) values ('a1000000-0000-4000-8000-000000000001', 4, '{}') $$,
  '42501', null, 'B no escribe en un taller ajeno');
do $$ begin perform pg_temp.attempt($q$ update public.quotes set payload = '{"hack":1}' where id = 1 $q$); perform pg_temp.attempt($q$ delete from public.quotes where id = 1 $q$); end $$;

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*)::int from public.quotes where payload <> '{"hack":1}'), 2, 'lo de A sigue intacto');

-- created_by lo pone el servidor, no el cliente: si no, un miembro podría
-- hacer pasar un presupuesto suyo por de otra persona (y el historial miente).
select lives_ok($$ insert into public.quotes (workspace_id, id, payload, created_by) values ('a1000000-0000-4000-8000-000000000001', 5, '{}', '44444444-4444-4444-8444-444444444444') $$, 'A guarda un presupuesto diciendo que es de B');
select is((select created_by from public.quotes where id = 5), '11111111-1111-4111-8111-111111111111'::uuid, 'created_by es A: lo fija el servidor');
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select lives_ok($$ update public.quotes set payload = '{"editado":1}' where id = 5 $$, 'M edita el presupuesto de A');
select is((select created_by from public.quotes where id = 5), '11111111-1111-4111-8111-111111111111'::uuid, 'editar no cambia quién lo creó');

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$ update public.quotes set updated_at = '2000-01-01', payload = '{"x":1}' where id = 1 $$, 'el cliente intenta fijar updated_at en el año 2000');
select is((select updated_at > '2020-01-01' from public.quotes where id = 1), true, 'updated_at lo pone la base de datos, no el cliente');
select lives_ok($$ update public.quotes set deleted_at = now() where id = 1 $$, 'borrar un presupuesto es una marca (tombstone) que otros dispositivos ven');
select is((select count(*)::int from public.quotes where deleted_at is not null), 1, 'la marca queda');
select throws_ok($$ insert into public.quotes (workspace_id, id, payload) values ('a1000000-0000-4000-8000-000000000001', 99, jsonb_build_object('x', repeat('a', 250000))) $$,
  '23514', null, 'un presupuesto por encima del tope de tamaño se rechaza');
select throws_ok($$ update public.quotes set workspace_id = 'a2000000-0000-4000-8000-000000000002' where id = 2 $$,
  '42501', null, 'un presupuesto no se puede mover a un taller del que no eres miembro');

-- ------------------------------------------------------------------
-- 7. Datos del negocio (finanzas): uno por taller
-- ------------------------------------------------------------------
select lives_ok($$ insert into public.business (workspace_id, payload) values ('a1000000-0000-4000-8000-000000000001', '{"name":"Taller A"}') $$, 'el jefe guarda los datos del negocio');
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select lives_ok($$ update public.business set payload = '{"name":"Taller A SL"}' where workspace_id = 'a1000000-0000-4000-8000-000000000001' $$, 'el encargado los puede editar');
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select count(*)::int from public.business), 0, 'el operario no ve los datos fiscales del negocio');
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$ insert into public.business (workspace_id, payload) values ('a1000000-0000-4000-8000-000000000001', '{}') $$,
  '23505', null, 'solo una fila de negocio por taller');
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select throws_ok($$ insert into public.business (workspace_id, payload) values ('a1000000-0000-4000-8000-000000000001', '{}') $$,
  '42501', null, 'B no escribe los datos de un negocio ajeno');

-- ------------------------------------------------------------------
-- 8. anon (la clave pública, sin iniciar sesión) no toca nada
-- ------------------------------------------------------------------
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is((select count(*)::int from unnest(array['workspaces', 'memberships', 'invitations', 'quotes', 'business']) t
           where pg_temp.attempt('select * from public.' || t) <> '42501'), 0, 'anon no puede leer ninguna tabla: permission denied, no solo "0 filas"');
select throws_ok($$ insert into public.quotes (workspace_id, id, payload) values ('a1000000-0000-4000-8000-000000000001', 50, '{}') $$, '42501', null, 'anon no escribe');
select throws_ok($$ select public.create_workspace('Anonimo') $$, '42501', null, 'anon no puede crear talleres');

-- ------------------------------------------------------------------
-- 9. Crear un taller y ciclo de vida
-- ------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select lives_ok($$ insert into fx select 'zws', public.create_workspace('Taller de Z')::text $$, 'Z crea su taller con create_workspace');
select is(public.has_role((select v::uuid from fx where k = 'zws'), array['owner']), true, 'quien crea un taller es su jefe');
select is((select owner_id from public.workspaces where id = (select v::uuid from fx where k = 'zws')), '55555555-5555-4555-8555-555555555555'::uuid, 'y su dueño');
select is((select count(*)::int from public.workspaces), 1, 'y lo ve (y solo ese)');

-- Borrar el taller es solo del jefe.
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
do $$ begin perform pg_temp.attempt($q$ delete from public.workspaces where id = 'a1000000-0000-4000-8000-000000000001' $q$); end $$;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
do $$ begin perform pg_temp.attempt($q$ delete from public.workspaces where id = 'a1000000-0000-4000-8000-000000000001' $q$); end $$;
select is((select count(*)::int from public.workspaces where id = 'a1000000-0000-4000-8000-000000000001'), 1, 'ni el operario ni el encargado borran el taller');

reset role;
-- on delete restrict: la cuenta del jefe no se borra mientras sea dueño de un taller.
select throws_ok($$ delete from auth.users where id = '11111111-1111-4111-8111-111111111111' $$, '23503', null, 'no se borra la cuenta del jefe mientras tenga un taller');
-- Quitar a una persona: su membresía se va, lo que hizo se queda sin autor.
select lives_ok($$ delete from auth.users where id = '22222222-2222-4222-8222-222222222222' $$, 'se borra la cuenta de un encargado');
select is((select count(*)::int from public.memberships where user_id = '22222222-2222-4222-8222-222222222222'), 0, 'su membresía desaparece');
select is((select count(*)::int from public.quotes where workspace_id = 'a1000000-0000-4000-8000-000000000001'), 3, 'los presupuestos del taller siguen ahí');
select is((select count(*)::int from public.quotes where workspace_id = 'a1000000-0000-4000-8000-000000000001' and created_by is null), 1, 'el que creó el encargado se queda sin autor (set null)');

-- El jefe borra su taller: se va todo lo del taller, y solo eso.
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$ delete from public.workspaces where id = 'a1000000-0000-4000-8000-000000000001' $$, 'el jefe borra su taller');
reset role;
select is((select count(*)::int from public.memberships where workspace_id = 'a1000000-0000-4000-8000-000000000001')
        + (select count(*)::int from public.invitations where workspace_id = 'a1000000-0000-4000-8000-000000000001')
        + (select count(*)::int from public.quotes where workspace_id = 'a1000000-0000-4000-8000-000000000001')
        + (select count(*)::int from public.business where workspace_id = 'a1000000-0000-4000-8000-000000000001'), 0, 'se lleva miembros, invitaciones, presupuestos y negocio (cascade)');
select is((select count(*)::int from public.workspaces where id = 'a2000000-0000-4000-8000-000000000002'), 1, 'el taller de B no se toca');
select lives_ok($$ delete from auth.users where id = '11111111-1111-4111-8111-111111111111' $$, 'y ahora sí se puede borrar la cuenta del jefe');

-- Taller de una sola persona: el borrado de cuenta empieza por borrar el taller.
select throws_ok($$ delete from auth.users where id = '55555555-5555-4555-8555-555555555555' $$, '23503', null, 'Z tampoco puede borrar su cuenta con el taller puesto');
set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select lives_ok($$ delete from public.workspaces where id = (select v::uuid from fx where k = 'zws') $$, 'Z borra su taller');
reset role;
select lives_ok($$ delete from auth.users where id = '55555555-5555-4555-8555-555555555555' $$, 'y entonces su cuenta');

select * from finish();
rollback;
