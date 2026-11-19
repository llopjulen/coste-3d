# Modo taller: varias personas, roles y permisos

Decidido con Julen el 2026-11-05. Se lee antes de escribir cualquier tabla, política o función de `supabase/migrations/`, porque cambia **de quién es un dato**: ya no es de una persona (`user_id`), es de un taller (`workspace_id`).

Lo que **no** está aquí, a propósito: cuántos asientos incluye el plan, precios y qué se vende. Eso va en el documento privado (este repositorio es público). Aquí solo hay modelo de datos y seguridad.

## La idea

El jefe crea un **taller**, invita por correo a su gente y cada persona entra con **su propia cuenta**. Todos ven las mismas impresoras y pedidos, pero cada rol ve lo que le toca: el operario ve qué hay que imprimir y no cuánto cuesta ni cuánto se cobra.

Una persona que trabaja sola **también tiene un taller**, de una sola persona. Así hay un solo código para los dos casos.

## Por qué `workspace_id` y no `user_id` (decisión)

| Opción | Problema |
|---|---|
| Seguir con `user_id` y una tabla «compartir con…» fila a fila | Cada consulta tiene que comprobar permisos por fila y por persona. Es lento, difícil de razonar y fácil de dejar un agujero. |
| Dos modelos: uno para cuentas sueltas y otro para talleres | Doble código, doble batería de tests, y pasar de uno a otro sería una migración de datos. |
| **`workspace_id` en todas las tablas; una cuenta suelta es un taller de uno** | **Elegida.** La política es siempre la misma pregunta: «¿soy miembro de este taller, y con qué rol?» |

Hacerlo ahora es barato (nada está aplicado todavía en ninguna base de datos). Hacerlo después obligaría a reescribir tablas, políticas, `save_order` y todos los tests.

## Roles y qué puede hacer cada uno

| Acción | Jefe (`owner`) | Encargado (`manager`) | Operario (`operator`) |
|---|:-:|:-:|:-:|
| Ver la cola, los pedidos (sin dinero), las líneas (sin precios), el calendario, las impresoras y sus trabajos | sí | sí | sí |
| Cambiar el estado de un pedido (imprimiendo, listo…) | sí | sí | sí, solo con `set_order_status` |
| Crear y editar pedidos y líneas | sí | sí | no |
| Ver y editar precios, costes, envío, descuento, comisiones y pagos | sí | sí | no |
| Presupuestos del calculador, datos del negocio y clientes | sí | sí | no |
| Vincular o revocar agentes (impresoras) | sí | sí | no |
| Invitar, quitar a miembros y cambiar roles | sí | no | no |
| Plan y facturación, borrar el taller, traspasar la propiedad | sí | no | no |

Hay **un solo jefe** por taller (un índice único lo garantiza). El encargado es «todo menos administrar el taller».

## Producción frente a finanzas: por qué hay tablas separadas

**RLS filtra filas, no columnas.** Si `unit_price` y `unit_cost` están en la misma fila que el nombre y la cantidad de una línea, ninguna política puede enseñar la fila entera a un rol y solo parte de ella a otro. Las opciones eran:

| Opción | Problema |
|---|---|
| Vistas que omiten las columnas de dinero | Hay que acordarse de revocar la tabla base a cada rol, y todos los roles de la API comparten el mismo rol de Postgres (`authenticated`): no se pueden dar permisos de columna distintos por rol del taller. |
| Funciones que devuelven JSON recortado según el rol | La lógica de seguridad vive en código que se puede olvidar de llamar. |
| **Separar en tablas: lo que se imprime y lo que se cobra** | **Elegida.** La separación es física: la política de cada tabla es una sola frase y es imposible leer por accidente lo que está en otra. |

Es la misma idea que el vertical partitioning de Bases de datos: partir una tabla por columnas según quién las usa.

- **Producción** (la ven los tres roles): `orders`, `order_lines`, `order_events` (los de tipo `created`, `status` y `edited`), impresoras y trabajos.
- **Finanzas** (solo jefe y encargado): `order_finance`, `order_line_prices`, `order_payments`, `customers`, `order_counters`, `quotes`, `business` y los eventos de tipo `payment` y `paymentRemoved` (que llevan importe).

Los eventos son una sola tabla, y la política mira el tipo de cada **fila**, que sí es filtrado por filas: `is_member(workspace_id) and (type in ('created','status','edited') or has_role(workspace_id, array['owner','manager']))`.

**Lo que el operario sí ve, a propósito:** el nombre del cliente de cada pedido (`orders.customer_name`, una copia) y las horas de cada pieza. Necesita saber para quién es y cuánto tarda. No ve la ficha del cliente (correo, teléfono, notas), que está en `customers`.

## Tablas nuevas

| Tabla | Columnas | Notas |
|---|---|---|
| `workspaces` | `id uuid pk`, `name text`, `owner_id uuid references auth.users on delete restrict`, `created_at` | `restrict`: no se borra la cuenta del jefe mientras haya otros miembros (ver «Ciclo de vida»). |
| `memberships` | `workspace_id`, `user_id`, `role text`, `created_at`; `pk (workspace_id, user_id)` | `role in ('owner','manager','operator')`. Índice único parcial `(workspace_id) where role = 'owner'`. Índice `(user_id, workspace_id)` porque cada consulta empieza por «¿de qué talleres soy?». |
| `invitations` | `id uuid pk`, `workspace_id`, `email`, `role`, `token_hash`, `invited_by`, `expires_at`, `accepted_at`, `revoked_at` | `role in ('manager','operator')`: nadie se invita como jefe. Una invitación abierta por correo y taller. |

Una persona puede ser miembro de **varios** talleres (el suyo y el de quien la contrata). Por eso el taller nunca es implícito: lo indica el front en cada llamada, y RLS comprueba que es miembro.

### Quién lee y quién escribe (lo que fijan los tests de `supabase/tests/workspaces.test.sql`)

| Tabla | La web lee | La web escribe |
|---|---|---|
| `workspaces` | los talleres de los que es miembro, y **el suyo aunque aún no tenga membresía** (hace falta para poder insertar su primera membresía) | crear uno a su nombre (`owner_id = auth.uid()`). El jefe puede cambiar el `name` y borrar el taller. **Nadie** cambia `owner_id` con un `update`: el traspaso es de una función |
| `memberships` | quién es miembro de su taller (todos los roles) | **nada**, salvo la fila de jefe al crear el taller. Altas, bajas y cambios de rol son de funciones |
| `invitations` | solo el jefe, y **sin `token_hash`** (permiso por columna: `select *` falla con `permission denied`) | **nada**. Crear, aceptar y revocar son de funciones |
| `quotes`, `business` | jefe y encargado | jefe y encargado. `created_by` lo pone el servidor y no cambia desde la web |

`anon` no tiene permiso sobre ninguna (`permission denied`, no «0 filas»).

Dos trampas que los tests cubren:
- **`insert … returning` sobre `workspaces`** aplica también la política de lectura: si esa política solo dijera «soy miembro», el jefe no vería el taller que acaba de crear (aún no tiene membresía) y el `insert` fallaría. Por eso la lectura incluye `owner_id = auth.uid()`, o `create_workspace` genera el `id` antes y no usa `returning`.
- **Un trigger que «protege» `created_by` restaurando el valor antiguo en cada `update`** rompe `on delete set null`: la clave foránea hace un `update` por debajo, el trigger lo deshace y el borrado de la cuenta falla. La protección solo debe aplicarse a las peticiones de la web (por ejemplo con `current_user in ('authenticated', 'anon')`), no a la propia base de datos.

## Cómo se comprueba el rol (y la recursión)

Una política de `memberships` que consulta `memberships` provoca **recursión infinita**: para decidir si puedes leer la tabla, Postgres tiene que leer la tabla, y para eso vuelve a aplicar la política. Se rompe con dos funciones auxiliares:

- `public.is_member(ws uuid) returns boolean`
- `public.has_role(ws uuid, roles text[]) returns boolean`

Las dos son `security definer` (leen `memberships` sin pasar por RLS), `stable` y con **`set search_path = ''`** (con una ruta de búsqueda vacía, un usuario no puede crear un objeto con el mismo nombre en otro esquema para que la función ejecute el suyo). Solo miran `where user_id = auth.uid()`: no devuelven nada de nadie más.

Es uno de los dos sitios donde `security definer` está justificado, y por eso conviene tenerlo localizado. El otro es `set_order_status`. En el resto, incluido `save_order`, **`security invoker`**: la función corre con los permisos de quien la llama y RLS se aplica dentro.

## El operario y el estado de un pedido

Una política de `update` sobre `orders` no distingue columnas: si el operario pudiera hacer `update`, podría cambiar también la fecha de entrega o las notas. Así que el operario **no tiene `update` directo** y cambia el estado con **`set_order_status(p_order_id uuid, p_to text)`**:

- Comprueba dentro (`has_role` con los tres roles) que es miembro del taller **del pedido**, no de cualquier taller.
- Cambia solo `status` y `delivered_at`, y escribe el evento con `actor_id = auth.uid()`.
- Valida que `p_to` sea un estado válido.

Como es `definer`, un fallo aquí se salta RLS. Los tests tienen que probar que un operario de **otro** taller no puede.

## Crear un taller

`create_workspace(p_name text)`, función `invoker`. Inserta el taller y la membresía de jefe; las políticas de `insert` permiten exactamente eso: `owner_id = auth.uid()` y `role = 'owner'` para el taller que acabas de crear. La web la llama la primera vez que alguien inicia sesión y no tiene ningún taller («Mi taller», editable).

Descartado: un trigger sobre `auth.users` que lo cree solo. Si ese trigger falla, **falla el registro de la persona**, y un fallo ahí es difícil de ver y de depurar.

## Invitaciones y asientos

Las hacen Edge Functions (necesitan enviar correo y comprobar el plan; los secretos no están en el navegador):

1. **`member-invite`** (sesión del jefe): comprueba que es el jefe, que quedan asientos y que no hay una invitación abierta para ese correo. Crea la fila con el **hash SHA-256** de un token aleatorio de 256 bits (el token en claro solo viaja en el enlace) y envía el correo. Caduca a los 7 días.
2. **`member-accept`** (sesión de la persona invitada): recibe el token, lo hashea y busca la invitación. Comprueba que **no ha caducado, que no está usada ni revocada y que el correo de la sesión coincide con el de la invitación y está verificado**. Para contar asientos sin carreras, bloquea la fila del taller (`select … for update`): dos aceptaciones a la vez no pueden pasarse del límite. Inserta la membresía y marca la invitación como aceptada, todo en una transacción.

Los asientos los fija el plan (`subscriptions`, ver NUBE.md); la cifra va en el documento privado.

Requisito: el correo de verdad necesita un **SMTP propio**. El que trae Supabase por defecto es para pruebas y limita mucho los envíos por hora.

## «Que no se pasen la cuenta»

Ninguna clave impide que alguien comparta su cuenta, y una segunda clave tampoco: se comparte igual. Lo que sí funciona, y es lo que hace este diseño:

- Cada persona entra con **un enlace a su propio correo** (sin contraseña, ya previsto en NUBE.md). Compartir la cuenta es compartir la bandeja de entrada.
- La invitación **va ligada a ese correo**: no sirve reenviada.
- **Asientos limitados por plan, comprobados en el servidor.** Para meter a otra persona hay que quitar a alguien, y el jefe lo ve en la lista de miembros.
- Quitar a un miembro **corta el acceso a los datos en el acto**: RLS consulta `memberships` en cada petición. El token de sesión (JWT) puede seguir válido hasta que caduque, pero no abre nada de ese taller.
- Todo lo que cada persona hace lleva su `actor_id` en el historial.

No se puede evitar que alguien le preste su bandeja de entrada a un compañero. Esto lo deja en «cuenta personal, de pago por asiento y rastreable».

## Ciclo de vida

| Caso | Qué pasa |
|---|---|
| Se quita a un miembro | Se borra su membresía. Sus `created_by` y `actor_id` se quedan (el historial sigue diciendo quién lo hizo). Los agentes que vinculó siguen: son del taller, no suyos. |
| Una persona borra su cuenta | Sus membresías se borran en cascada y sus `created_by` / `actor_id` pasan a `null` (`on delete set null`). |
| El jefe borra su cuenta | La cuenta **no se borra mientras sea dueña de un taller**, esté sola o no: `workspaces.owner_id` va con `on delete restrict`, y Postgres rechaza el borrado del usuario (`23503`). Hay que borrar o traspasar el taller antes. Borrar el taller es un `delete` del jefe sobre `workspaces` y se lleva todo lo del taller (`cascade`). El flujo «borrar mi cuenta» de la web lo hace en ese orden: si el taller tiene más miembros, **se niega** y explica que hay que traspasar la propiedad; si es de una sola persona, borra el taller y después la cuenta. (Corregido el 2026-11-05: antes decía a la vez `restrict` y «cascada», y con un `restrict` normal lo segundo es imposible.) |
| Impago | El taller pasa a solo lectura y se puede exportar, no se borra nada. Se concreta en el PR de pago: «lo que se cobra se aplica en el servidor». |

## Cambios que esto obliga a hacer en el resto

- **Todas las tablas** llevan `workspace_id uuid not null references workspaces on delete cascade` en vez de `user_id`. Las escritas por el jefe y el encargado llevan además `created_by uuid references auth.users on delete set null`, que pone el servidor.
- **`quotes` y `business`** pasan a ser del taller y a ser de finanzas. Aviso: la clave de `quotes` es `(workspace_id, id)` con `id = Date.now()` generado en cada dispositivo; dos personas del mismo taller pueden, con muy mala suerte, generar el mismo milisegundo, y un `upsert` pisaría el presupuesto del otro. Es improbable, pero conviene que los presupuestos nuevos pasen a `uuid` antes de sincronizar (se decide en el PR de sincronización).
- **`agents`, `printers`, `printer_status`, `jobs`** son del taller. El token del agente pertenece al taller, no a la persona que lo vinculó.
- **`subscriptions`** es por taller (`workspace_id`).
- **`save_order` y `next_order_number`** reciben el taller como primer parámetro (ver PEDIDOS.md).
- **El front** recibe del adaptador un pedido **sin dinero** cuando el rol es operario (`unitPrice`, `unitCost`, `shipping`, `payments`… a `null`) y la interfaz oculta lo que no hay. Lo hace Claude en un PR aparte.

## Orden de PRs

Esto no añade pasos antes del 2: el modelo (`workspaces`, `memberships`, `workspace_id` en las tablas, helpers y políticas) entra **dentro de la migración del paso 2**. Las invitaciones, la interfaz de miembros y los asientos entran como **paso 6 bis** de NUBE.md, tras la flota en la nube y antes del pago, que es quien los hace cumplir.

## Lo que queda abierto

- **Plan y precio.** La pestaña «Planes» promete hoy un plan Taller de **una persona** con varias impresoras y varios dispositivos. Un taller con varias personas y roles es otra cosa: si va en ese plan, en uno superior o por asiento, y cuántos asientos incluye, lo decide Julen en el documento privado. Hasta que exista, conviene **no anunciarlo** en la web.
- **Cobro por asiento.** Hay que comprobar qué admite Polar (suscripción por cantidad de asientos o un plan por tramos) antes de diseñar el webhook.
- **Datos personales de los trabajadores.** Cuando una persona trabaja en el taller de otra, el taller es quien decide para qué se usan sus datos. Va a las páginas legales (paso 8 de NUBE.md).
