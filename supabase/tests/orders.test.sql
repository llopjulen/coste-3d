-- ==================================================================
-- Tests de la base de datos de pedidos en el modo taller
-- (docs/PEDIDOS.md y docs/TALLER.md). Sustituyen a los del 2026-11-04,
-- que eran del modelo «un usuario, sus datos» (`user_id`).
--
-- Se ejecutan con `supabase test db` (pgTAP). Todo corre en una
-- transacción que acaba en ROLLBACK: no deja nada en la base de datos.
--
-- Qué protegen, por orden de gravedad:
--   1. Aislamiento entre talleres: nadie ve, edita, borra ni cuelga datos
--      de un taller del que no es miembro, tampoco por save_order ni por
--      set_order_status.
--   2. Producción frente a finanzas: el operario ve qué imprimir (pedido,
--      líneas, horas, para quién) y nada de dinero (precios, costes,
--      envío, pagos, eventos con importe, fichas de cliente).
--   3. El operario solo cambia el estado, y solo con set_order_status.
--   4. Atomicidad: save_order guarda el pedido entero o nada, en las
--      tablas de producción y en las de finanzas a la vez.
--   5. Integridad: números únicos por taller, restricciones, quién hizo
--      cada cosa (created_by, actor_id puestos por el servidor),
--      set null y cascade.
--
-- Las mismas cinco personas y dos talleres que workspaces.test.sql:
--   A jefe de Taller 1 · M encargado de Taller 1 · O operario de Taller 1
--   B jefe de Taller 2
-- ==================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(89);

-- true si el rol actual no puede leer ninguna fila de la tabla: o le sale
-- vacía (RLS) o no tiene ni permiso para mirarla (mejor aún).
create function pg_temp.reads_nothing(tbl text) returns boolean language plpgsql as $f$
declare n bigint;
begin
  execute format('select count(*) from %s', tbl) into n;
  return n = 0;
exception when insufficient_privilege then
  return true;
end
$f$;

-- Intenta algo y se traga el error; después se comprueba el ESTADO. Para
-- cuando lo que importa es que no cambie nada, falle o toque 0 filas.
create function pg_temp.attempt(q text) returns text language plpgsql as $f$
begin execute q; return 'ok';
exception when others then return sqlstate;
end
$f$;

-- Cuenta filas como superusuario (sin RLS), para comprobar el estado real
-- después de que alguien sin permiso lo intentara.
create function pg_temp.real_count(q text) returns bigint language plpgsql security definer as $f$
declare n bigint;
begin execute q into n; return n; end
$f$;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'a@test.local'),
  ('22222222-2222-4222-8222-222222222222', 'm@test.local'),
  ('33333333-3333-4333-8333-333333333333', 'o@test.local'),
  ('44444444-4444-4444-8444-444444444444', 'b@test.local');
insert into public.workspaces (id, name, owner_id) values
  ('a1000000-0000-4000-8000-000000000001', 'Taller A', '11111111-1111-4111-8111-111111111111'),
  ('a2000000-0000-4000-8000-000000000002', 'Taller B', '44444444-4444-4444-8444-444444444444');
insert into public.memberships (workspace_id, user_id, role) values
  ('a1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('a1000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'manager'),
  ('a1000000-0000-4000-8000-000000000001', '33333333-3333-4333-8333-333333333333', 'operator'),
  ('a2000000-0000-4000-8000-000000000002', '44444444-4444-4444-8444-444444444444', 'owner');

-- Un pedido del Taller 1 tal como lo manda el front (src/orders.js): dos
-- líneas, un pago, un evento. Trae un workspaceId que NO es el suyo: el
-- taller lo decide el parámetro de save_order, nunca el JSON.
create temp table fx (k text primary key, v jsonb) on commit drop;
grant all on fx to authenticated, anon;
insert into fx values ('order1', $json${
  "id": "0a000000-0000-4000-8000-000000000001",
  "workspaceId": "a2000000-0000-4000-8000-000000000002",
  "number": 1,
  "customerId": "0c000000-0000-4000-8000-000000000001",
  "customerName": "Bar Pepe",
  "status": "pending",
  "lines": [
    {"id": "0d000000-0000-4000-8000-000000000001", "quoteId": 1793613600001, "name": "Llavero", "qty": 25, "unitPrice": 2.5, "unitCost": 1.2, "hours": 0.5},
    {"id": "0d000000-0000-4000-8000-000000000002", "quoteId": null, "name": "Montaje", "qty": 1, "unitPrice": 5, "unitCost": 0, "hours": null}
  ],
  "shipping": 4.95, "discount": 0, "fees": 1.5, "channel": "Etsy",
  "payments": [
    {"id": "0e000000-0000-4000-8000-000000000001", "amount": 10, "method": "bizum", "at": "2026-11-04", "note": "Señal"}
  ],
  "dueAt": "2026-11-20", "deliveredAt": null, "notes": "Logo dorado",
  "createdAt": "2026-11-04T10:00:00.000Z", "updatedAt": "2026-11-04T10:00:00.000Z",
  "history": [{"at": "2026-11-04T10:00:00.000Z", "type": "created"}]
}$json$);
-- La misma pedido editado: una línea menos, imprimiendo, y en el historial
-- un pago (evento con importe, de finanzas) y un cambio de estado.
insert into fx select 'order1-edited',
  jsonb_set(jsonb_set(jsonb_set(v,
    '{lines}', jsonb_build_array(v->'lines'->0)),
    '{status}', '"printing"'),
    '{history}', '[{"at": "2026-11-04T10:00:00.000Z", "type": "created"},
                   {"at": "2026-11-04T10:30:00.000Z", "type": "payment", "amount": 10},
                   {"at": "2026-11-04T11:00:00.000Z", "type": "status", "from": "pending", "to": "printing"}]')
  from fx where k = 'order1';

-- ------------------------------------------------------------------
-- 1. Estructura
-- ------------------------------------------------------------------
select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.orders')), false), 'RLS activado en orders');
select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.order_lines')), false), 'RLS activado en order_lines');
select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.order_events')), false), 'RLS activado en order_events');
select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.order_finance')), false), 'RLS activado en order_finance');
select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.order_line_prices')), false), 'RLS activado en order_line_prices');
select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.order_payments')), false), 'RLS activado en order_payments');
select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.customers')), false), 'RLS activado en customers');
select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.order_counters')), false), 'RLS activado en order_counters');
select has_function('public', 'next_order_number', array['uuid'], 'existe next_order_number(uuid)');
select has_function('public', 'save_order', array['uuid', 'jsonb'], 'existe save_order(uuid, jsonb)');
select has_function('public', 'set_order_status', array['uuid', 'text'], 'existe set_order_status(uuid, text)');
-- save_order con invoker: RLS se aplica dentro. Con definer se la saltaría
-- (lo comprobamos el 2026-11-04: B sobrescribía un pedido de A).
select isnt_definer('public', 'save_order', array['uuid', 'jsonb'], 'save_order es security invoker');
-- set_order_status sí es definer (el operario no tiene update sobre orders),
-- así que tiene que llevar search_path vacío para que no la secuestren.
select is_definer('public', 'set_order_status', array['uuid', 'text'], 'set_order_status es security definer');
select ok(coalesce((select 'search_path=""' = any(proconfig) from pg_proc where oid = to_regprocedure('public.set_order_status(uuid,text)')), false),
  'set_order_status lleva search_path vacío');

-- ------------------------------------------------------------------
-- 2. A, jefe del Taller 1: contador, cliente, guardar un pedido
-- ------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select is(public.next_order_number('a1000000-0000-4000-8000-000000000001'), 1, 'A: el primer número del Taller 1 es 1');
select is(public.next_order_number('a1000000-0000-4000-8000-000000000001'), 2, 'A: el segundo es 2');
select throws_ok($$ select public.next_order_number('a2000000-0000-4000-8000-000000000002') $$,
  null, null, 'A no puede sacar números del Taller 2, que no es suyo');

select lives_ok($$
  insert into public.customers (id, workspace_id, name, created_at, updated_at)
  values ('0c000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Bar Pepe', now(), now())
$$, 'A crea un cliente en su taller');
select throws_ok($$
  insert into public.customers (id, workspace_id, name, created_at, updated_at)
  values ('0c000000-0000-4000-8000-000000000009', 'a2000000-0000-4000-8000-000000000002', 'Intruso', now(), now())
$$, '42501', null, 'A no puede crear un cliente en el Taller 2');

select lives_ok($$ select public.save_order('a1000000-0000-4000-8000-000000000001', (select v from fx where k = 'order1')) $$,
  'A guarda un pedido con 2 líneas y 1 pago');
select is((select workspace_id from public.orders where id = '0a000000-0000-4000-8000-000000000001'),
  'a1000000-0000-4000-8000-000000000001'::uuid, 'el pedido es del taller del parámetro, no del workspaceId del JSON');
select is((select created_by from public.orders where id = '0a000000-0000-4000-8000-000000000001'),
  '11111111-1111-4111-8111-111111111111'::uuid, 'created_by lo pone el servidor: A');
select is((select count(*)::int from public.order_lines where order_id = '0a000000-0000-4000-8000-000000000001'), 2, 'sus 2 líneas (producción)');
select is((select count(*)::int from public.order_line_prices p join public.order_lines l on l.id = p.line_id
           where l.order_id = '0a000000-0000-4000-8000-000000000001'), 2, 'y los precios de las 2 (finanzas)');
select is((select unit_price from public.order_line_prices where line_id = '0d000000-0000-4000-8000-000000000001'), 2.5::numeric,
  'unitPrice llega a order_line_prices.unit_price');
select is((select shipping from public.order_finance where order_id = '0a000000-0000-4000-8000-000000000001'), 4.95::numeric,
  'el envío va a order_finance');
select is((select count(*)::int from public.order_payments where order_id = '0a000000-0000-4000-8000-000000000001'), 1, 'su pago');
select is((select actor_id from public.order_events where order_id = '0a000000-0000-4000-8000-000000000001' and type = 'created'),
  '11111111-1111-4111-8111-111111111111'::uuid, 'el evento lleva actor_id = A');
select is((select name from public.order_lines where order_id = '0a000000-0000-4000-8000-000000000001' order by position limit 1),
  'Llavero', 'las líneas guardan su orden (position)');

-- Todo o nada: la segunda línea es inválida (qty 0).
select throws_ok($$
  select public.save_order('a1000000-0000-4000-8000-000000000001', jsonb_set(jsonb_set(jsonb_set(jsonb_set((select v from fx where k = 'order1'),
    '{id}', '"0a000000-0000-4000-8000-000000000002"'), '{number}', '2'),
    '{lines}', '[{"id": "0d000000-0000-4000-8000-000000000011", "name": "Bien", "qty": 1, "unitPrice": 1, "unitCost": 0},
                 {"id": "0d000000-0000-4000-8000-000000000012", "name": "Mal", "qty": 0, "unitPrice": 1, "unitCost": 0}]'),
    '{payments}', '[]'))
$$, '23514', null, 'una línea con cantidad 0 se rechaza');
select is(pg_temp.real_count($$ select count(*) from public.orders where id = '0a000000-0000-4000-8000-000000000002' $$), 0::bigint,
  'y no queda nada del pedido a medias');
select is(pg_temp.real_count($$ select count(*) from public.order_lines where id = '0d000000-0000-4000-8000-000000000011' $$)
        + pg_temp.real_count($$ select count(*) from public.order_finance where order_id = '0a000000-0000-4000-8000-000000000002' $$), 0::bigint,
  'ni su primera línea ni su fila de finanzas');

select throws_ok($$
  select public.save_order('a1000000-0000-4000-8000-000000000001', jsonb_set(jsonb_set(jsonb_set((select v from fx where k = 'order1'),
    '{id}', '"0a000000-0000-4000-8000-000000000003"'), '{lines}', '[]'), '{payments}', '[]'))
$$, '23505', null, 'otro pedido con el mismo número en el mismo taller se rechaza');
select throws_ok($$
  select public.save_order('a1000000-0000-4000-8000-000000000001', jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set((select v from fx where k = 'order1'),
    '{id}', '"0a000000-0000-4000-8000-000000000004"'), '{number}', '4'), '{lines}', '[]'), '{payments}', '[]'), '{status}', '"lost"'))
$$, '23514', null, 'un estado que no existe se rechaza');
select throws_ok($$
  select public.save_order('a1000000-0000-4000-8000-000000000001', jsonb_set(jsonb_set(jsonb_set(jsonb_set((select v from fx where k = 'order1'),
    '{id}', '"0a000000-0000-4000-8000-000000000005"'), '{number}', '5'), '{lines}', '[]'),
    '{payments}', '[{"id": "0e000000-0000-4000-8000-000000000005", "amount": -10, "method": "cash", "at": "2026-11-04", "note": ""}]'))
$$, '23514', null, 'un pago negativo se rechaza');
select throws_ok($$
  select public.save_order('a1000000-0000-4000-8000-000000000001', jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set((select v from fx where k = 'order1'),
    '{id}', '"0a000000-0000-4000-8000-000000000006"'), '{number}', '6'), '{lines}', '[]'), '{payments}', '[]'), '{shipping}', '-1'))
$$, '23514', null, 'un envío negativo se rechaza');
select throws_ok($$
  select public.save_order('a2000000-0000-4000-8000-000000000002', jsonb_set(jsonb_set((select v from fx where k = 'order1'),
    '{id}', '"0a000000-0000-4000-8000-000000000007"'), '{lines}', '[]'))
$$, null, null, 'A no puede guardar un pedido en el Taller 2');
select is(pg_temp.real_count($$ select count(*) from public.orders where workspace_id = 'a2000000-0000-4000-8000-000000000002' $$), 0::bigint,
  'y el Taller 2 sigue sin pedidos');

-- ------------------------------------------------------------------
-- 3. M, encargado del Taller 1: todo menos administrar el taller
-- ------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is(public.next_order_number('a1000000-0000-4000-8000-000000000001'), 3, 'M: el contador es del taller, sigue por el 3');
select is((select count(*)::int from public.order_finance), 1, 'M ve las finanzas del pedido');
select lives_ok($$ select public.save_order('a1000000-0000-4000-8000-000000000001', (select v from fx where k = 'order1-edited')) $$,
  'M guarda el pedido editado');
select is((select count(*)::int from public.order_lines where order_id = '0a000000-0000-4000-8000-000000000001'), 1,
  'la línea quitada en el front desaparece');
select is(pg_temp.real_count($$ select count(*) from public.order_line_prices where line_id = '0d000000-0000-4000-8000-000000000002' $$), 0::bigint,
  'y su precio con ella');
select is((select status from public.orders where id = '0a000000-0000-4000-8000-000000000001'), 'printing', 'el estado nuevo está');
select is((select count(*)::int from public.order_events where order_id = '0a000000-0000-4000-8000-000000000001'), 3,
  'el historial no se duplica: created + payment + status');
select is((select actor_id from public.order_events where order_id = '0a000000-0000-4000-8000-000000000001' and type = 'status'),
  '22222222-2222-4222-8222-222222222222'::uuid, 'los eventos nuevos llevan actor_id = M');

-- ------------------------------------------------------------------
-- 4. O, operario del Taller 1: ve qué imprimir, nada de dinero
-- ------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select is((select count(*)::int from public.orders), 1, 'O ve el pedido de su taller');
select is((select customer_name from public.orders where id = '0a000000-0000-4000-8000-000000000001'), 'Bar Pepe',
  'O ve para quién es (la copia del nombre)');
select is((select count(*)::int from public.order_lines), 1, 'O ve las líneas');
select is((select hours from public.order_lines where id = '0d000000-0000-4000-8000-000000000001'), 0.5::numeric,
  'O ve las horas de cada pieza');
select is((select count(*)::int from public.order_events where order_id = '0a000000-0000-4000-8000-000000000001'), 2,
  'O ve los eventos de producción (created, status) pero no el del pago');
select ok(pg_temp.reads_nothing('public.order_finance'), 'O no ve envío, descuento ni comisiones');
select ok(pg_temp.reads_nothing('public.order_line_prices'), 'O no ve precios ni costes');
select ok(pg_temp.reads_nothing('public.order_payments'), 'O no ve los pagos');
select ok(pg_temp.reads_nothing('public.customers'), 'O no ve las fichas de cliente');
select ok(pg_temp.reads_nothing('public.order_counters'), 'O no ve el contador');
select throws_ok($$ select public.next_order_number('a1000000-0000-4000-8000-000000000001') $$,
  null, null, 'O no puede sacar números de pedido (no crea pedidos)');

select is(pg_temp.attempt($$ update public.orders set notes = 'cambiado por O', due_at = '2026-12-31' where id = '0a000000-0000-4000-8000-000000000001' $$)
          in ('ok', '42501'), true, 'el update directo de O no rompe nada…');
select is(pg_temp.real_count($$ select count(*) from public.orders where notes = 'Logo dorado' and due_at = '2026-11-20' $$), 1::bigint,
  '…y no cambia el pedido: el operario no tiene update sobre orders');
select throws_ok($$ select public.save_order('a1000000-0000-4000-8000-000000000001', jsonb_set((select v from fx where k = 'order1-edited'), '{notes}', '"por O"')) $$,
  null, null, 'O no puede usar save_order');
select is(pg_temp.real_count($$ select count(*) from public.orders where notes = 'por O' $$), 0::bigint, 'y el pedido sigue igual');

select lives_ok($$ select public.set_order_status('0a000000-0000-4000-8000-000000000001', 'ready') $$,
  'O marca el pedido como listo con set_order_status');
select is((select status from public.orders where id = '0a000000-0000-4000-8000-000000000001'), 'ready', 'el estado cambia');
select is(pg_temp.real_count($$ select count(*) from public.order_events where order_id = '0a000000-0000-4000-8000-000000000001'
   and type = 'status' and from_status = 'printing' and to_status = 'ready' and actor_id = '33333333-3333-4333-8333-333333333333' $$), 1::bigint,
  'y queda el evento printing → ready con actor_id = O');
select lives_ok($$ select public.set_order_status('0a000000-0000-4000-8000-000000000001', 'delivered') $$, 'O lo marca como entregado');
select isnt((select delivered_at from public.orders where id = '0a000000-0000-4000-8000-000000000001'), null, 'y se pone la fecha de entrega');
select throws_ok($$ select public.set_order_status('0a000000-0000-4000-8000-000000000001', 'lost') $$,
  null, null, 'un estado inventado se rechaza también en set_order_status');

-- ------------------------------------------------------------------
-- 5. B, jefe del Taller 2: no ve ni toca nada del Taller 1
-- ------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';

select is(public.next_order_number('a2000000-0000-4000-8000-000000000002'), 1, 'B: su taller tiene su propio contador, empieza en 1');
select ok(pg_temp.reads_nothing('public.orders'), 'B no ve los pedidos del Taller 1');
select ok(pg_temp.reads_nothing('public.order_lines'), 'B no ve sus líneas');
select ok(pg_temp.reads_nothing('public.order_events'), 'B no ve su historial');
select ok(pg_temp.reads_nothing('public.order_finance'), 'B no ve sus finanzas');
select ok(pg_temp.reads_nothing('public.order_line_prices'), 'B no ve sus precios');
select ok(pg_temp.reads_nothing('public.order_payments'), 'B no ve sus pagos');
select ok(pg_temp.reads_nothing('public.customers'), 'B no ve sus clientes');

select throws_ok($$
  insert into public.order_lines (id, order_id, workspace_id, position, name, qty)
  values ('0d000000-0000-4000-8000-000000000099', '0a000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 9, 'Colada', 1)
$$, '42501', null, 'B no puede colgar una línea de un pedido del Taller 1, ni poniendo su propio taller');
select throws_ok($$ select public.save_order('a2000000-0000-4000-8000-000000000002', jsonb_set((select v from fx where k = 'order1-edited'), '{notes}', '"hackeado por B"')) $$,
  null, null, 'B no puede sobrescribir el pedido del Taller 1 con save_order, ni desde su taller');
select throws_ok($$ select public.set_order_status('0a000000-0000-4000-8000-000000000001', 'cancelled') $$,
  null, null, 'B no puede cambiar el estado de un pedido del Taller 1');
select is(pg_temp.real_count($$ select count(*) from public.orders where id = '0a000000-0000-4000-8000-000000000001'
   and status = 'delivered' and notes = 'Logo dorado' and workspace_id = 'a1000000-0000-4000-8000-000000000001' $$), 1::bigint,
  'el pedido del Taller 1 sigue intacto');

-- Sin sesión: nada.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select ok(pg_temp.reads_nothing('public.orders'), 'sin sesión no se ve ningún pedido');
select ok(pg_temp.reads_nothing('public.order_finance'), 'sin sesión no se ven finanzas');
select throws_ok($$ select public.set_order_status('0a000000-0000-4000-8000-000000000001', 'cancelled') $$,
  null, null, 'sin sesión no se cambia ningún estado');

-- ------------------------------------------------------------------
-- 6. Otra vez A: el historial solo crece, set null y cascade
-- ------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- El front de A todavía no ha recargado: su JSON no trae los eventos que
-- escribió set_order_status. Guardar no puede borrarlos.
select lives_ok($$ select public.save_order('a1000000-0000-4000-8000-000000000001',
  jsonb_set((select v from fx where k = 'order1-edited'), '{status}', '"delivered"')) $$, 'A guarda con un historial atrasado');
select is(pg_temp.real_count($$ select count(*) from public.order_events where order_id = '0a000000-0000-4000-8000-000000000001'
   and actor_id = '33333333-3333-4333-8333-333333333333' $$), 2::bigint,
  'los eventos que escribió el operario siguen ahí: save_order nunca borra historial');

select lives_ok($$ delete from public.customers where id = '0c000000-0000-4000-8000-000000000001' $$, 'A borra su cliente');
select is((select customer_id from public.orders where id = '0a000000-0000-4000-8000-000000000001'), null, 'el pedido pierde el enlace (set null)');
select is((select customer_name from public.orders where id = '0a000000-0000-4000-8000-000000000001'), 'Bar Pepe', 'pero conserva el nombre');

select lives_ok($$ delete from public.orders where id = '0a000000-0000-4000-8000-000000000001' $$, 'A borra el pedido');
select is(pg_temp.real_count($$ select
    (select count(*) from public.order_lines where order_id = '0a000000-0000-4000-8000-000000000001')
  + (select count(*) from public.order_line_prices where line_id = '0d000000-0000-4000-8000-000000000001')
  + (select count(*) from public.order_finance where order_id = '0a000000-0000-4000-8000-000000000001')
  + (select count(*) from public.order_payments where order_id = '0a000000-0000-4000-8000-000000000001')
  + (select count(*) from public.order_events where order_id = '0a000000-0000-4000-8000-000000000001') $$), 0::bigint,
  'y se lleva sus líneas, precios, finanzas, pagos y eventos (cascade)');

select * from finish();
rollback;
