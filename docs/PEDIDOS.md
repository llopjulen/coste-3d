# Pedidos y clientes: modelo, contrato y esquema propuesto

Decidido con Julen el 2026-11-04:
- El pedido es una **entidad propia** con varias líneas.
- **Estado y pago van por separado.**
- Los **clientes** también son una entidad propia.
- Claude hace el front sobre un adaptador; Julen hace la base de datos (migraciones, RLS y el adaptador de Supabase). Claude lo revisa y escribe los tests.

Cambiado el 2026-11-05, por el modo taller (docs/TALLER.md, léelo antes):
- Los datos son **de un taller** (`workspace_id`), no de una persona (`user_id`). Una cuenta suelta es un taller de una persona.
- **Producción y finanzas van en tablas separadas**: el operario ve qué hay que imprimir y no cuánto cuesta. RLS filtra filas, no columnas, así que la separación es física.
- `save_order` y `next_order_number` reciben el taller como primer parámetro.

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
- 5000 pedidos y 5000 clientes por taller.
- Textos: nombre 80, canal 40, nota de pago 120, notas 2000 (1000 en clientes), email 120, teléfono 40.

## El contrato del adaptador (src/ordersStore.js)

La pantalla solo habla con un «store». Hoy existe `createLocalStore()` (localStorage). El de Supabase será otro objeto con **los mismos métodos**, todos asíncronos:

| Método | Devuelve | Reglas |
|---|---|---|
| `load()` | `{ orders, customers }` | Validados (`sanitizeOrders`, `sanitizeCustomers`). Pedidos del más nuevo al más viejo; clientes por nombre. |
| `nextOrderNumber()` | entero | Nunca se repite y nunca baja, aunque se borren pedidos. |
| `saveOrder(order)` | el pedido guardado | Inserta o actualiza por `id`. Número único por taller. |
| `deleteOrder(id)` | — | Borra también sus líneas, pagos y eventos (cascade). |
| `saveCustomer(c)` | el cliente guardado | Inserta o actualiza por `id`. |
| `deleteCustomer(id)` | — | Sus pedidos se quedan con `customerId = null` y conservan `customerName`. |

Si una escritura falla, lanza `StoreError`. La pantalla dice entonces «no se ha guardado» en lugar de enseñar datos que no están en ningún sitio.

**El taller y el rol.** El store de Supabase se crea para un taller concreto, `createSupabaseStore({ workspaceId })`, porque una persona puede ser miembro de varios. Y `load()` devuelve el dinero según el rol: para un operario, los pedidos llegan con `unitPrice`, `unitCost`, `shipping`, `discount`, `fees`, `channel` y `payments` a `null`, y `customers` vacío. La interfaz oculta lo que no hay (lo hace Claude en el front, en un PR aparte).

El adaptador de Supabase traduce entre el objeto anidado del front y las tablas de abajo:
- Las líneas, los pagos y el historial van en sus propias tablas.
- Los nombres pasan de camelCase a snake_case.
- `saveOrder` tiene que ser **atómico**: o se guarda el pedido con todas sus líneas y pagos, o nada. Decidido el 2026-11-04: una función de Postgres **`save_order(p_workspace_id uuid, p_order jsonb)`** con el pedido tal cual lo tiene el front (camelCase, anidado). Una función es una sola transacción, y el adaptador queda en `supabase.rpc('save_order', { p_workspace_id: workspaceId, p_order: order })`. Con varias llamadas `upsert` sueltas desde el navegador, un corte de red a medias dejaría un pedido sin líneas. (El 2026-11-04 la firma era `save_order(p_order jsonb)`; el taller pasa a ser un parámetro porque una persona puede ser miembro de varios y ya no hay un «taller implícito» como había un `auth.uid()`.)
- **`save_order` va con `security invoker`** (lo que viene por defecto), **no `definer`**. Con invoker la función corre con los permisos del usuario y RLS se aplica dentro. Con definer las políticas no se aplican: en los tests, una versión `definer` dejó que el usuario B sobrescribiera un pedido de A.
- Qué hace `save_order` con lo que ya hay:
  - El pedido se inserta o se actualiza por `id`.
  - Las líneas y los pagos se reemplazan por los del JSON, porque el front manda siempre la lista entera.
  - El historial **solo crece**: se insertan los eventos que aún no estaban, sin duplicar los que ya había.
  - `workspace_id` llega como parámetro y **RLS comprueba que la persona es miembro con rol de finanzas** (jefe o encargado). `created_by` y `actor_id` los pone el servidor (`auth.uid()`) y nunca salen del JSON. Si el JSON trae un `workspaceId` distinto, se ignora.
  - Escribe en las tablas de producción **y** en las de finanzas del taller: una línea son dos filas (`order_lines` y `order_line_prices`), un pedido son dos (`orders` y `order_finance`). Sigue siendo una sola transacción.

## Esquema propuesto (lo escribe Julen en `supabase/migrations/`)

Todas las tablas llevan `workspace_id uuid not null references workspaces on delete cascade` y **RLS activado**. Las tablas hijas llevan también el `workspace_id` (copiado del padre) y la política comprueba que **el pedido padre es del mismo taller**: sin eso, alguien podría colgar una línea suya de un pedido de otro taller con solo conocer su id.

Hay dos grupos, según quién puede leerlos (la razón está en docs/TALLER.md):
- **Producción**, la leen jefe, encargado y operario: política `using (public.is_member(workspace_id))` para leer; escribir, solo jefe y encargado (`public.has_role(workspace_id, array['owner','manager'])`).
- **Finanzas**, solo jefe y encargado, para leer y escribir: `using / with check (public.has_role(workspace_id, array['owner','manager']))`.

### Producción

| Tabla | Columnas | Restricciones |
|---|---|---|
| `orders` | `id uuid pk`, `workspace_id`, `number int`, `customer_id uuid null references customers on delete set null`, `customer_name text`, `status text`, `due_at date null`, `delivered_at date null`, `notes text`, `created_by uuid null references auth.users on delete set null`, `created_at`, `updated_at` | `unique (workspace_id, number)`, `number > 0`, `status in (…)` |
| `order_lines` | `id uuid pk`, `order_id uuid references orders on delete cascade`, `workspace_id`, `position int`, `quote_id bigint null`, `name text`, `qty int`, `hours numeric null` | `qty between 1 and 100000`, máx. 50 por pedido |
| `order_events` | `id bigint generated always as identity pk`, `order_id … on delete cascade`, `workspace_id`, `at timestamptz`, `type text`, `from_status text null`, `to_status text null`, `amount numeric(12,2) null`, `actor_id uuid null references auth.users on delete set null` | `type in (…)`; solo insert, sin update. **Lectura:** los tipos `created`, `status` y `edited` los ve cualquier miembro; `payment` y `paymentRemoved` (llevan importe) solo jefe y encargado |

### Finanzas

| Tabla | Columnas | Restricciones |
|---|---|---|
| `customers` | `id uuid pk`, `workspace_id`, `name text`, `email text`, `phone text`, `notes text`, `created_at`, `updated_at` | `char_length(name) between 1 and 80`, límites de texto de arriba |
| `order_finance` | `order_id uuid pk references orders on delete cascade`, `workspace_id`, `shipping numeric(12,4)`, `discount numeric(12,4)`, `fees numeric(12,4)`, `channel text` | importes `>= 0`. Una fila por pedido |
| `order_line_prices` | `line_id uuid pk references order_lines on delete cascade`, `workspace_id`, `unit_price numeric(12,4)`, `unit_cost numeric(12,4)` | importes `>= 0`. Una fila por línea |
| `order_payments` | `id uuid pk`, `order_id … on delete cascade`, `workspace_id`, `amount numeric(12,2)`, `method text`, `paid_on date`, `note text` | `amount > 0`, `method in (…)`, máx. 50 por pedido |
| `order_counters` | `workspace_id pk`, `last_number int` | La usa `next_order_number(p_workspace_id)` |

`customer_name` está en `orders` (producción) y no en `customers`: es una copia, como en una factura, y el operario necesita saber para quién es el pedido. La ficha con el correo y el teléfono, no.

Notas para escribirlo:
- **`numeric` y no `float`** para el dinero: en binario 0,1 no existe exacto. Se usan 4 decimales en los precios por pieza, porque una pieza de 0,055 € existe, y 2 en los pagos, que son dinero real.
- **`next_order_number(p_workspace_id uuid)`:**
  - `insert … on conflict (workspace_id) do update set last_number = order_counters.last_number + 1 returning last_number`.
  - Es una sola sentencia, así que dos pestañas a la vez no pueden sacar el mismo número. Es la condición de carrera clásica: leer y luego escribir en dos pasos fallaría. El contador es **por taller**: dos personas del mismo taller que piden número a la vez también tienen que salir distintas.
  - El `unique (workspace_id, number)` es la red de seguridad.
- **`position`** guarda el orden de las líneas, que en el JSON es implícito.
- **Índices:** `orders (workspace_id, status)`, `orders (workspace_id, due_at)` para la cola y el calendario, y `order_lines (order_id)`.
- **El historial** lo puede escribir la función de guardado comparando el estado viejo y el nuevo, o un trigger. Si lo hace el servidor, el cliente no puede inventarse eventos, y `actor_id` es siempre quien hizo la llamada.
- **`set_order_status(p_order_id uuid, p_to text)`**: la única forma en que un operario cambia algo (ver docs/TALLER.md). Es `security definer` y tiene que comprobar dentro que el pedido es de un taller del que la persona es miembro.
- **Las funciones `is_member` y `has_role`** de docs/TALLER.md son las que usan todas las políticas.

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

## Tests (modo taller, reescritos el 2026-11-06, antes que el SQL)

Escritos antes que la implementación, para que fijen el contrato (TDD). Sustituyen a los del 2026-11-04, que eran del modelo `user_id`. Se ejecutan con `npm run test:db` (`supabase start` en marcha), junto con los del núcleo del taller (`supabase/tests/workspaces.test.sql`).

- **`supabase/tests/orders.test.sql`** (pgTAP, 89 tests), con las mismas personas que los del taller (A jefe, M encargado y O operario del Taller 1; B jefe del Taller 2):
  - **Estructura:** RLS en las 8 tablas de pedidos; existen `next_order_number(uuid)`, `save_order(uuid, jsonb)` y `set_order_status(uuid, text)`; `save_order` es `invoker`, y `set_order_status` es `definer` con `search_path` vacío.
  - **Contador por taller:** A saca 1 y 2, M (mismo taller) sigue por el 3, B (otro taller) empieza en 1. El operario no puede sacar números.
  - **`save_order`:**
    - Guarda el JSON del front repartido entre producción y finanzas.
    - El taller es el del parámetro, aunque el JSON traiga otro `workspaceId`.
    - `created_by` y `actor_id` los pone el servidor.
    - Es todo o nada.
    - Guardar otra vez reemplaza líneas, precios y pagos, sin duplicar ni borrar historial.
    - No se puede guardar en un taller ajeno ni sobrescribir un pedido ajeno.
  - **El operario:**
    - Ve el pedido, las líneas, las horas y para quién es, y los eventos de producción.
    - **No** ve finanzas, precios, pagos, fichas de cliente, contador ni el evento de pago.
    - No tiene `update` ni `save_order`.
    - Sí puede usar `set_order_status`: cambia el estado, pone `delivered_at` y escribe el evento con su `actor_id`. Un estado inventado se rechaza.
  - **B (otro taller) y `anon`:** no ven nada; no cuelgan líneas en un pedido ajeno; no lo sobrescriben ni le cambian el estado.
  - **Ciclo de vida:** borrar un cliente deja el nombre (set null); borrar un pedido se lleva líneas, precios, finanzas, pagos y eventos (cascade).
- **`scripts/db/order-numbers-race.sh`:** 40 conexiones de dos personas del mismo taller piden número a la vez; tienen que salir 1..40. Crea su taller de prueba y lo borra al acabar.

Comprobados contra una implementación de referencia privada (no está en el repositorio: la de verdad la escribe Julen). Cada uno de estos fallos hace fallar al menos un test:
- eventos de pago visibles al operario;
- precios visibles a cualquier miembro;
- operario con `update` en `orders`;
- `set_order_status` sin comprobar el taller del pedido;
- `set_order_status` sin `search_path`;
- `save_order` con `definer`;
- `save_order` que borra y reescribe el historial;
- líneas sin comprobar el pedido padre;
- contador global en vez de por taller;
- `save_order` que se fía del `workspaceId` del JSON;
- contador en dos pasos (40 peticiones dieron 3 números).

### Dos detalles que fijan los tests (salieron al escribir la referencia)

- **No duplicar el historial sin borrarlo.** El front manda siempre su historial entero, pero `set_order_status` escribe eventos en el servidor que ese JSON aún no tiene (el front no ha recargado). Si `save_order` borrara y reescribiera, perdería los eventos del operario; si insertara todo, duplicaría. La regla que funciona: **insertar solo los eventos del JSON que no existen ya**, comparando por `(order_id, at, type)`. Y sin política de `delete` en `order_events`: así, ni un fallo en `save_order` puede borrar historial.
- **`on conflict (id) do update` no puede mover un pedido de taller.** Si B llama a `save_order` desde su taller con el id de un pedido de A, el `update` del conflicto tiene que fallar. RLS ya lo impide (la fila de A no pasa la política de `update` de B), pero conviene además no tocar nunca `workspace_id` en el `do update`.
