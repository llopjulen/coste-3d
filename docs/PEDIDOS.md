# Pedidos y clientes: modelo, contrato y esquema propuesto

Decidido con Julen el 2026-11-04:
- El pedido es una **entidad propia** con varias líneas.
- **Estado y pago van por separado.**
- Los **clientes** también son una entidad propia.
- Claude hace el front sobre un adaptador; Julen hace la base de datos (migraciones, RLS y el adaptador de Supabase). Claude lo revisa y escribe los tests.

Este documento es el punto de encuentro. Si en la base de datos algo tiene que ser distinto, se cambia aquí primero y luego en los dos lados.

## Por qué así

- **Antes, «pedido» era un estado de cada presupuesto guardado** (`status: 'order'` en `savedQuotes`), así que una pieza era un pedido. Un taller vende pedidos con varias piezas, señal, envío y entrega. El presupuesto sigue siendo lo que era: la pieza con su precio calculado.
- **Estado y pago son dos ejes.** «Entregado pero medio pagado» y «pagado por adelantado, sin imprimir» son casos de cada día. Con un solo campo harían falta todas las combinaciones.
- **El estado del pago no se guarda, se calcula.** Sin pagar, señal o pagado sale de la suma de los pagos frente al total (`orderTotals`). Un dato derivado guardado puede desincronizarse; uno calculado no. Es la misma idea que no guardar un campo calculable en una tabla (3FN).
- **Las líneas copian nombre, precio y coste** del presupuesto. Un pedido es un compromiso al precio de ese día: editar o borrar el presupuesto después no puede cambiar lo vendido. `quote_id` es solo un enlace de vuelta.
- **`customer_name` es una copia** del nombre del cliente ese día, como en una factura. `customer_id` enlaza con la ficha. Si se borra la ficha, el pedido conserva el nombre (`on delete set null`).
- **El historial es una lista de eventos que solo crece** (append-only): creado, cambio de estado, pago, pago quitado, editado. Las ediciones seguidas en menos de 10 minutos cuentan como un solo evento, para que escribir una nota letra a letra no llene el historial.

## Estados

`pending` (pendiente) → `printing` (imprimiendo) → `ready` (listo) → `delivered` (entregado), y `cancelled` (cancelado) desde cualquiera.

- Se puede volver atrás; cada cambio queda en el historial.
- `delivered_at` se pone al marcarlo entregado y se borra si vuelve atrás.
- **Abiertos** (necesitan impresora y salen en la cola del calendario): `pending`, `printing`, `ready`.
- Los cancelados no cuentan en ninguna suma.

Pago, derivado: `unpaid` (sin pagar), `deposit` (señal) o `paid` (pagado). Se considera pagado si falta menos de medio céntimo.

## Forma en el front (src/orders.js, src/customers.js)

```js
order = {
  id: 'uuid', number: 12,                         // #0012
  customerId: 'uuid' | null, customerName: 'Bar Pepe',
  status: 'pending' | 'printing' | 'ready' | 'delivered' | 'cancelled',
  lines: [{ id, quoteId: 1730..., name, qty, unitPrice, unitCost, hours }],  // hours por pieza buena, con fallos
  shipping, discount, fees,                       // EUR ≥ 0
  channel: 'Etsy',
  payments: [{ id, amount, method, at: 'YYYY-MM-DD', note }],
  dueAt: 'YYYY-MM-DD' | null, deliveredAt: 'YYYY-MM-DD' | null,
  notes, createdAt, updatedAt,                    // ISO
  history: [{ at, type: 'created'|'status'|'payment'|'paymentRemoved'|'edited', from?, to?, amount? }],
}
customer = { id, name, email, phone, notes, createdAt, updatedAt }
```

`method`: `cash`, `card`, `transfer`, `bizum`, `platform`, `other`.

Límites, que la base de datos también tiene que imponer:
- 50 líneas y 50 pagos por pedido.
- 200 eventos de historial (se guardan los más nuevos).
- 5000 pedidos y 5000 clientes por persona.
- Textos: nombre 80, canal 40, nota de pago 120, notas 2000 (1000 en clientes), email 120, teléfono 40.

## El contrato del adaptador (src/ordersStore.js)

La pantalla solo habla con un «store». Hoy existe `createLocalStore()` (localStorage). El de Supabase será otro objeto con **los mismos métodos**, todos asíncronos:

| Método | Devuelve | Reglas |
|---|---|---|
| `load()` | `{ orders, customers }` | Validados (`sanitizeOrders`, `sanitizeCustomers`). Pedidos del más nuevo al más viejo; clientes por nombre. |
| `nextOrderNumber()` | entero | Nunca se repite y nunca baja, aunque se borren pedidos. |
| `saveOrder(order)` | el pedido guardado | Inserta o actualiza por `id`. Número único por persona. |
| `deleteOrder(id)` | — | Borra también sus líneas, pagos y eventos (cascade). |
| `saveCustomer(c)` | el cliente guardado | Inserta o actualiza por `id`. |
| `deleteCustomer(id)` | — | Sus pedidos se quedan con `customerId = null` y conservan `customerName`. |

Si una escritura falla, lanza `StoreError`. La pantalla dice entonces «no se ha guardado» en lugar de enseñar datos que no están en ningún sitio.

El adaptador de Supabase traduce entre el objeto anidado del front y las tablas de abajo:
- Las líneas, los pagos y el historial van en sus propias tablas.
- Los nombres pasan de camelCase a snake_case.
- `saveOrder` tiene que ser **atómico**: o se guarda el pedido con todas sus líneas y pagos, o nada. Decidido el 2026-11-04: una función de Postgres **`save_order(p_order jsonb)`** con el pedido tal cual lo tiene el front (camelCase, anidado). Una función es una sola transacción, y el adaptador queda en `supabase.rpc('save_order', { p_order: order })`. Con varias llamadas `upsert` sueltas desde el navegador, un corte de red a medias dejaría un pedido sin líneas.
- **`save_order` va con `security invoker`** (lo que viene por defecto), **no `definer`**. Con invoker la función corre con los permisos del usuario y RLS se aplica dentro. Con definer las políticas no se aplican: en los tests, una versión `definer` dejó que el usuario B sobrescribiera un pedido de A.
- Qué hace `save_order` con lo que ya hay:
  - El pedido se inserta o se actualiza por `id`.
  - Las líneas y los pagos se reemplazan por los del JSON, porque el front manda siempre la lista entera.
  - El historial **solo crece**: se insertan los eventos que aún no estaban, sin duplicar los que ya había.
  - `user_id` lo pone el servidor (`auth.uid()`) y nunca sale del JSON.

## Esquema propuesto (lo escribe Julen en `supabase/migrations/`)

Todas las tablas llevan `user_id uuid not null references auth.users on delete cascade` y **RLS activado**, con la política `user_id = auth.uid()` para select, insert, update y delete. Las tablas hijas además comprueban que el pedido padre es del mismo usuario.

| Tabla | Columnas | Restricciones |
|---|---|---|
| `customers` | `id uuid pk`, `user_id`, `name text`, `email text`, `phone text`, `notes text`, `created_at timestamptz`, `updated_at timestamptz` | `char_length(name) between 1 and 80`, límites de texto de arriba |
| `orders` | `id uuid pk`, `user_id`, `number int`, `customer_id uuid null references customers on delete set null`, `customer_name text`, `status text`, `shipping numeric(12,4)`, `discount numeric(12,4)`, `fees numeric(12,4)`, `channel text`, `due_at date null`, `delivered_at date null`, `notes text`, `created_at`, `updated_at` | `unique (user_id, number)`, `number > 0`, `status in (…)`, importes `>= 0` |
| `order_lines` | `id uuid pk`, `order_id uuid references orders on delete cascade`, `position int`, `quote_id bigint null`, `name text`, `qty int`, `unit_price numeric(12,4)`, `unit_cost numeric(12,4)`, `hours numeric null` | `qty between 1 and 100000`, importes `>= 0`, máx. 50 por pedido |
| `order_payments` | `id uuid pk`, `order_id … on delete cascade`, `amount numeric(12,2)`, `method text`, `paid_on date`, `note text` | `amount > 0`, `method in (…)` |
| `order_events` | `id bigint generated always as identity pk`, `order_id … on delete cascade`, `at timestamptz`, `type text`, `from_status text null`, `to_status text null`, `amount numeric(12,2) null` | `type in (…)`; en la práctica solo insert, sin update |
| `order_counters` | `user_id pk`, `last_number int` | La usa `next_order_number()` |

Notas para escribirlo:
- **`numeric` y no `float`** para el dinero: en binario 0,1 no existe exacto. Se usan 4 decimales en los precios por pieza, porque una pieza de 0,055 € existe, y 2 en los pagos, que son dinero real.
- **`next_order_number()`:**
  - `insert … on conflict (user_id) do update set last_number = order_counters.last_number + 1 returning last_number`.
  - Es una sola sentencia, así que dos pestañas a la vez no pueden sacar el mismo número. Es la condición de carrera clásica: leer y luego escribir en dos pasos fallaría.
  - El `unique (user_id, number)` es la red de seguridad.
- **`position`** guarda el orden de las líneas, que en el JSON es implícito.
- **Índices:** `orders (user_id, status)`, `orders (user_id, due_at)` para la cola y el calendario, y `order_lines (order_id)`.
- **El historial** lo puede escribir la función de guardado comparando el estado viejo y el nuevo, o un trigger. Si lo hace el servidor, el cliente no puede inventarse eventos.

## Migración de lo que ya existe

`migrateQuoteOrders` (orders.js) convierte cada presupuesto guardado con `status` `order` o `sold` en un pedido:
- `order` → pendiente, con su fecha de entrega.
- `sold` → entregado el día de la venta, con un pago por lo cobrado y sus comisiones.

Al presupuesto se le pone `orderId`, así que volver a ejecutarla no duplica nada (es idempotente). Después, `linkCustomers` (customers.js) da una ficha a cada nombre de cliente, reutilizando la que ya exista con el mismo nombre (sin distinguir mayúsculas ni tildes). Se ejecutan en el PR que conecta la pestaña con el Historial.

## Copia de seguridad

Las claves `orders`, `customers` y `orderCounter` van dentro del JSON como claves opcionales, sin subir `BACKUP_SCHEMA_VERSION`. Restaurar una copia vieja no borra los pedidos.

Al fusionar (Merge):
- Gana la versión de este navegador.
- Un pedido nuevo cuyo número ya existe recibe uno libre por encima de todos (`mergeOrders`).
- El contador se queda con el mayor.

## Tests (hechos el 2026-11-04, antes que el SQL)

Están escritos antes que la implementación, para que definan el contrato (TDD). Se ejecutan con `npm run test:db` (`supabase start` en marcha):

- **`supabase/tests/orders.test.sql`** (pgTAP, 52 tests):
  - RLS activado en las 6 tablas; existen `next_order_number()` y `save_order(jsonb)`.
  - Contador por usuario.
  - `save_order` guarda el JSON del front: líneas en orden, decimales, fechas y `user_id` del servidor. Guardar otra vez reemplaza líneas y pagos sin duplicar el historial.
  - Todo o nada: una línea inválida no deja ni el pedido ni las otras líneas.
  - Restricciones: número repetido, estado inventado, pago o envío negativos, cliente sin nombre.
  - B no ve, no edita y no borra nada de A, no cuelga líneas de un pedido de A y no lo sobrescribe con `save_order`. `anon` no ve nada.
  - Borrar un cliente deja el nombre en el pedido (set null); borrar un pedido se lleva sus hijos (cascade).
- **`scripts/db/order-numbers-race.sh`**: 40 conexiones piden número a la vez. Tienen que salir 1..40 sin repetidos.

Los tests se comprobaron contra una implementación de referencia privada (no está en el repositorio: la de verdad la escribe Julen). También se comprobó que **fallan** ante los fallos típicos:
- línea sin comprobar el pedido padre;
- `security definer`;
- eventos duplicados;
- RLS olvidado en una tabla;
- `qty` sin `check`;
- `cascade` en vez de `set null`;
- contador en dos pasos (40 peticiones dieron solo 3 números distintos).
