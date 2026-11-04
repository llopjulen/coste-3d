-- ==================================================================
-- Tests de la base de datos de pedidos (docs/PEDIDOS.md).
--
-- Se ejecutan con `supabase test db` (pgTAP). Cada test corre dentro
-- de una transacción que acaba en ROLLBACK, así que no deja nada en la
-- base de datos.
--
-- Qué protegen, por orden de gravedad:
--   1. Aislamiento (RLS): nadie ve, edita, borra ni cuelga datos de
--      otro usuario, ni siquiera a través de save_order.
--   2. Atomicidad: save_order guarda el pedido entero o nada.
--   3. Integridad: números únicos por usuario, restricciones de los
--      importes y estados, ON DELETE SET NULL / CASCADE.
--   4. Que el contrato con el front se cumple: el pedido llega en el
--      mismo JSON (camelCase) que usa src/orders.js.
--
-- Cómo se hace pasar por un usuario: igual que hace Supabase con cada
-- petición. Se cambia al rol `authenticated` y se pone el JWT en
-- `request.jwt.claims`; auth.uid() lee el `sub` de ahí.
-- ==================================================================
begin;
create extension if not exists pgtap with schema extensions;

select plan(52);

-- true si el rol actual no puede leer ninguna fila de la tabla: o la
-- tabla le sale vacía (RLS) o no tiene permiso ni para mirarla (mejor).
create function pg_temp.reads_nothing(tbl text) returns boolean language plpgsql as $f$
declare n bigint;
begin
  execute format('select count(*) from %s', tbl) into n;
  return n = 0;
exception when insufficient_privilege then
  return true;
end
$f$;

-- Dos usuarios de prueba. UUID fijos para poder leer los fallos.
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@test.local'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@test.local');

-- Un pedido de A tal como lo manda el front (src/orders.js), con dos
-- líneas, un pago y un evento. Los ids son UUID como los de newId().
create temp table fx (k text primary key, v jsonb) on commit drop;
grant all on fx to authenticated, anon;
insert into fx values ('order1', $json${
  "id": "0a000000-0000-4000-8000-000000000001",
  "number": 1,
  "customerId": "0c000000-0000-4000-8000-000000000001",
  "customerName": "Bar Pepe",
  "status": "pending",
  "lines": [
    {"id": "0d000000-0000-4000-8000-000000000001", "quoteId": 1730700000000, "name": "Llavero", "qty": 25, "unitPrice": 2.5, "unitCost": 1.2, "hours": 0.5},
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

-- ------------------------------------------------------------------
-- 1. Estructura: las tablas existen y tienen RLS activado
-- ------------------------------------------------------------------
select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.customers')), false), 'RLS activado en customers');
select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.orders')), false), 'RLS activado en orders');
select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.order_lines')), false), 'RLS activado en order_lines');
select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.order_payments')), false), 'RLS activado en order_payments');
select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.order_events')), false), 'RLS activado en order_events');
select ok(coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.order_counters')), false), 'RLS activado en order_counters');
select has_function('public', 'next_order_number', 'existe next_order_number()');
select has_function('public', 'save_order', array['jsonb'], 'existe save_order(jsonb)');

-- ------------------------------------------------------------------
-- 2. Como A: contador, cliente y guardar un pedido
-- ------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

select is(public.next_order_number(), 1, 'A: el primer número es 1');
select is(public.next_order_number(), 2, 'A: el segundo es 2');

select lives_ok($$
  insert into public.customers (id, user_id, name, created_at, updated_at)
  values ('0c000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Bar Pepe', now(), now())
$$, 'A crea su cliente');
select throws_ok($$
  insert into public.customers (id, user_id, name, created_at, updated_at)
  values ('0c000000-0000-4000-8000-000000000009', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Intruso', now(), now())
$$, '42501', null, 'A no puede crear un cliente a nombre de B');
select throws_ok($$
  insert into public.customers (id, user_id, name, created_at, updated_at)
  values ('0c000000-0000-4000-8000-000000000008', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '', now(), now())
$$, '23514', null, 'un cliente sin nombre se rechaza');

select lives_ok($$ select public.save_order((select v from fx where k = 'order1')) $$, 'A guarda un pedido con 2 líneas y 1 pago');
select is((select count(*)::int from public.orders where id = '0a000000-0000-4000-8000-000000000001'), 1, 'el pedido está');
select is((select user_id from public.orders where id = '0a000000-0000-4000-8000-000000000001'), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'el pedido es de A aunque el JSON no lo diga');
select is((select count(*)::int from public.order_lines where order_id = '0a000000-0000-4000-8000-000000000001'), 2, 'sus 2 líneas están');
select is((select count(*)::int from public.order_payments where order_id = '0a000000-0000-4000-8000-000000000001'), 1, 'su pago está');
select is((select count(*)::int from public.order_events where order_id = '0a000000-0000-4000-8000-000000000001'), 1, 'su evento está');
select is((select name from public.order_lines where order_id = '0a000000-0000-4000-8000-000000000001' order by position limit 1), 'Llavero', 'las líneas guardan su orden (position)');
select is((select unit_price from public.order_lines where id = '0d000000-0000-4000-8000-000000000001'), 2.5::numeric, 'unitPrice llega a unit_price sin perder decimales');
select is((select due_at from public.orders where id = '0a000000-0000-4000-8000-000000000001'), '2026-11-20'::date, 'dueAt llega a due_at como fecha');

-- Guardar otra vez el mismo pedido: una línea menos, otro estado y un
-- evento más en el historial. Lo que manda es el JSON nuevo.
select lives_ok($$
  select public.save_order(
    jsonb_set(jsonb_set(jsonb_set((select v from fx where k = 'order1'),
      '{lines}', (select jsonb_build_array(v->'lines'->0) from fx where k = 'order1')),
      '{status}', '"printing"'),
      '{history}', '[{"at": "2026-11-04T10:00:00.000Z", "type": "created"},
                     {"at": "2026-11-04T11:00:00.000Z", "type": "status", "from": "pending", "to": "printing"}]'))
$$, 'A vuelve a guardar el pedido editado');
select is((select count(*)::int from public.order_lines where order_id = '0a000000-0000-4000-8000-000000000001'), 1, 'la línea quitada en el front desaparece');
select is((select status from public.orders where id = '0a000000-0000-4000-8000-000000000001'), 'printing', 'el estado nuevo está');
select is((select count(*)::int from public.order_events where order_id = '0a000000-0000-4000-8000-000000000001'), 2, 'el historial no se duplica al guardar otra vez: 2 eventos');

-- ------------------------------------------------------------------
-- 3. Atomicidad e integridad: todo o nada
-- ------------------------------------------------------------------
-- Un pedido nuevo cuya segunda línea es inválida (qty 0): no puede
-- quedar el pedido sin líneas, ni la primera línea suelta.
select throws_ok($$
  select public.save_order(jsonb_set(jsonb_set(jsonb_set(jsonb_set((select v from fx where k = 'order1'),
    '{id}', '"0a000000-0000-4000-8000-000000000002"'), '{number}', '2'),
    '{lines}', '[{"id": "0d000000-0000-4000-8000-000000000011", "name": "Bien", "qty": 1, "unitPrice": 1, "unitCost": 0},
                 {"id": "0d000000-0000-4000-8000-000000000012", "name": "Mal", "qty": 0, "unitPrice": 1, "unitCost": 0}]'),
    '{payments}', '[]'))
$$, '23514', null, 'una línea con cantidad 0 se rechaza');
select is((select count(*)::int from public.orders where id = '0a000000-0000-4000-8000-000000000002'), 0, 'y del pedido no queda nada a medias');
select is((select count(*)::int from public.order_lines where id = '0d000000-0000-4000-8000-000000000011'), 0, 'ni su primera línea, que era válida');

select throws_ok($$
  select public.save_order(jsonb_set(jsonb_set((select v from fx where k = 'order1'),
    '{id}', '"0a000000-0000-4000-8000-000000000003"'), '{lines}', '[]'))
$$, '23505', null, 'otro pedido con el mismo número (1) se rechaza');
select throws_ok($$
  select public.save_order(jsonb_set(jsonb_set(jsonb_set(jsonb_set((select v from fx where k = 'order1'),
    '{id}', '"0a000000-0000-4000-8000-000000000004"'), '{number}', '4'), '{lines}', '[]'), '{status}', '"lost"'))
$$, '23514', null, 'un estado que no existe se rechaza');
select throws_ok($$
  select public.save_order(jsonb_set(jsonb_set(jsonb_set(jsonb_set((select v from fx where k = 'order1'),
    '{id}', '"0a000000-0000-4000-8000-000000000005"'), '{number}', '5'), '{lines}', '[]'),
    -- sin líneas: las de order1 ya existen y chocarían antes que el pago
    '{payments}', '[{"id": "0e000000-0000-4000-8000-000000000005", "amount": -10, "method": "cash", "at": "2026-11-04", "note": ""}]'))
$$, '23514', null, 'un pago negativo se rechaza');
select throws_ok($$
  select public.save_order(jsonb_set(jsonb_set(jsonb_set(jsonb_set((select v from fx where k = 'order1'),
    '{id}', '"0a000000-0000-4000-8000-000000000006"'), '{number}', '6'), '{lines}', '[]'), '{shipping}', '-1'))
$$, '23514', null, 'un envío negativo se rechaza');

-- ------------------------------------------------------------------
-- 4. Como B: no ve ni toca nada de A
-- ------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';

select is(public.next_order_number(), 1, 'B tiene su propio contador: empieza en 1');
select is_empty($$ select 1 from public.orders $$, 'B no ve los pedidos de A');
select is_empty($$ select 1 from public.order_lines $$, 'B no ve las líneas de A');
select is_empty($$ select 1 from public.order_payments $$, 'B no ve los pagos de A');
select is_empty($$ select 1 from public.order_events $$, 'B no ve el historial de A');
select is_empty($$ select 1 from public.customers $$, 'B no ve los clientes de A');
select is_empty($$ select 1 from public.order_counters where user_id <> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$, 'B no ve el contador de A');

-- Un UPDATE o DELETE sobre filas que RLS esconde no falla: afecta a 0 filas.
select is_empty($$ update public.orders set notes = 'hackeado' where id = '0a000000-0000-4000-8000-000000000001' returning 1 $$, 'B no puede editar el pedido de A');
select is_empty($$ delete from public.orders where id = '0a000000-0000-4000-8000-000000000001' returning 1 $$, 'B no puede borrar el pedido de A');
select throws_ok($$
  insert into public.order_lines (id, order_id, user_id, position, name, qty, unit_price, unit_cost)
  values ('0d000000-0000-4000-8000-000000000099', '0a000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 9, 'Colada', 1, 0, 0)
$$, '42501', null, 'B no puede colgar una línea de un pedido de A, ni a su propio nombre');
-- save_order con el id de un pedido de A: tiene que fallar (lo que importa
-- es que falle y no cambie nada; el código de error puede variar).
select throws_ok($$
  select public.save_order(jsonb_set((select v from fx where k = 'order1'), '{notes}', '"hackeado por B"'))
$$, null, null, 'B no puede sobrescribir un pedido de A con save_order');

-- anon (sin sesión) no lee nada: ni filas ni, mejor aún, permiso.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select ok(pg_temp.reads_nothing('public.orders'), 'sin sesión no se ve ningún pedido');
select ok(pg_temp.reads_nothing('public.customers'), 'sin sesión no se ve ningún cliente');

-- ------------------------------------------------------------------
-- 5. Otra vez como A: nada ha cambiado, y los borrados en cascada
-- ------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

select is((select notes from public.orders where id = '0a000000-0000-4000-8000-000000000001'), 'Logo dorado', 'el pedido de A sigue intacto');

select lives_ok($$ delete from public.customers where id = '0c000000-0000-4000-8000-000000000001' $$, 'A borra su cliente');
select is((select customer_id from public.orders where id = '0a000000-0000-4000-8000-000000000001'), null, 'el pedido pierde el enlace al cliente (on delete set null)');
select is((select customer_name from public.orders where id = '0a000000-0000-4000-8000-000000000001'), 'Bar Pepe', 'pero conserva su nombre');

select lives_ok($$ delete from public.orders where id = '0a000000-0000-4000-8000-000000000001' $$, 'A borra su pedido');
select is((select count(*)::int from public.order_lines where order_id = '0a000000-0000-4000-8000-000000000001')
        + (select count(*)::int from public.order_payments where order_id = '0a000000-0000-4000-8000-000000000001')
        + (select count(*)::int from public.order_events where order_id = '0a000000-0000-4000-8000-000000000001'),
        0, 'sus líneas, pagos y eventos se borran con él (cascade)');

select * from finish();
rollback;
