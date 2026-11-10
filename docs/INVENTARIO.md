# Inventario de filamento: modelo, contrato y plan

Decidido con Julen el 2026-11-10:
- **Local primero, Supabase después.** Se sigue el mismo patrón que los pedidos: un adaptador local hoy (`spoolsStore.js`) y el contrato escrito aquí para que el adaptador de Supabase lo cumpla después.
- **El descuento es automático y se puede ajustar a mano.** Un pedido en «Imprimiendo» reserva sus gramos y al pasar a «Listo» se descuentan. Pesar la bobina corrige el stock.
- **La bobina se enlaza con la calculadora.** Elegir una bobina en el presupuesto rellena su precio y su peso, y avisa si no queda bastante.
- **Las etiquetas y su diseño los hace Julen.** Este modelo le deja un código corto y estable por bobina y una URL para el QR (ver «Etiquetas»).

Este documento es el punto de encuentro, como docs/PEDIDOS.md. Si algo tiene que cambiar, se cambia aquí primero.

## En qué mejora a la competencia

Printago (19 oct 2026) lleva el stock de cada bobina y el coste de cada impresión. Lo calcula **después** de imprimir. Aquí la pregunta es la de **antes**:

1. **¿Tengo material para aceptar este pedido?** El presupuesto avisa en el momento de dar el precio si la bobina no llega.
2. **¿Cuándo me quedo sin él?** Los pedidos abiertos y sus fechas de entrega (la cola EDF de schedule.js) dicen qué bobina se acaba y antes de qué pedido. Así puedes comprar a tiempo y no cuando ya te has quedado sin material.
3. **El precio sale de la bobina que compraste**, no de un número genérico que nadie actualiza.
4. **Pesar la bobina con su tara** basta para corregir el stock. No hace falta llevar la cuenta de cada gramo.
5. **Sin cuenta ni plan de pago.** Funciona en el navegador como el resto de la calculadora.

## Por qué así

- **El stock no se guarda: se calcula.** Lo que queda en una bobina es `netWeight + Σ movements.grams`. Si se guardara un campo `remaining` al lado de los movimientos, podrían no cuadrar. Es la misma idea que el estado del pago en los pedidos (3FN: no guardar lo que se puede calcular).
- **Los movimientos solo crecen** (append-only, como un libro de contabilidad). Para corregir un error no se edita un movimiento: se añade otro. Así siempre se sabe por qué una bobina tiene lo que tiene.
- **Las reservas tampoco se guardan.** Salen de los pedidos abiertos y de sus líneas. Si un pedido se cancela, la reserva desaparece sola, sin borrar nada.
- **La línea del pedido copia los gramos y la bobina** del presupuesto el día que se crea, igual que copia el precio. Si después editas el presupuesto, el pedido ya comprometido no cambia.
- **Los gramos de la línea incluyen los fallos.** Se guardan como `gramos / (1 − failRate)`, con el mismo techo de 0,95 que `calculate`. Una impresión fallida también gasta filamento, y las horas de la línea ya se guardan así. Pesar la bobina corrige la diferencia con la realidad.

## Forma en el front (src/spools.js)

```js
spool = {
  id: 'uuid',
  code: 7,                       // se enseña como B-0007; nunca se repite en el taller
  material: 'PLA',               // texto libre, con sugerencias: PLA, PETG, ABS, ASA, TPU, PA, PC…
  brand: 'Bambu Lab', color: 'Negro', colorHex: '#1a1a1a',
  diameter: 1.75,                // mm: 1.75 | 2.85
  netWeight: 1000,               // g de filamento cuando estaba nueva
  tareWeight: 250,               // g de la bobina vacía, para pesar (null si no se sabe)
  price: 19.99,                  // EUR pagados por la bobina
  purchasedAt: 'YYYY-MM-DD' | null,
  location: 'AMS 1 · ranura 2',  // texto libre
  lowStockGrams: 150,            // aviso por debajo de esto
  archived: false,               // gastada o tirada: deja de salir, pero su historial se conserva
  notes, createdAt, updatedAt,
}

movement = {
  id: 'uuid', spoolId, at: ISO,
  type: 'consume' | 'reverse' | 'adjust',
  grams: -45.2,                  // con signo: gastar es negativo
  orderId: 'uuid' | null, lineId: 'uuid' | null,
  note: '',
}
```

- `consume`: se crea al pasar un pedido a «Listo», uno por línea y bobina.
- `reverse`: si el pedido vuelve atrás o se cancela después de «Listo», anula el `consume` con el signo contrario.
- `adjust`: pesar la bobina o corregirla a mano. Al pesar, `grams = (bruto − tara) − lo que quedaba`.
- **Idempotencia:** para cada `(orderId, lineId, spoolId)`, la suma de `consume` y `reverse` solo puede ser el consumo de la línea o 0. Si se vuelve a ejecutar el mismo cambio de estado, no descuenta dos veces.

Lo que cambia en otros modelos:
- **Presupuesto (`inputs`):** `spoolId` para el filamento principal y `extraFilaments[].spoolId` para los demás. Son opcionales y `null` por defecto, así que los presupuestos viejos siguen igual.
- **Línea del pedido:** `filaments: [{ spoolId | null, label, grams }]`, una entrada por filamento (la principal lleva la purga). Es opcional: una línea sin ella no reserva ni descuenta nada.

Derivados, que calcula `spools.js` con funciones puras:
- `remaining(spool, movements)`: lo que queda.
- `reserved(spoolId, orders)`: los gramos de las líneas de pedidos en `printing`.
- `committed(spoolId, orders)`: lo mismo con los pedidos en `pending`.
- `runsOutBefore(spool, movements, orders)`: el primer pedido abierto, en el orden de la cola EDF, para el que ya no quedan gramos. Si alcanza para todos, `null`.
- `costPerGram(spool)`: `price / netWeight`. Es lo que la calculadora pone como `spoolPrice` y `spoolWeight`.

Límites, que la base de datos también tiene que imponer:
- 500 bobinas por taller.
- 5000 movimientos en local (alrededor de 600 KB de localStorage). Al pasar de ahí, los movimientos de más de 12 meses de cada bobina se compactan en un solo `adjust` con la nota «carry»: el stock no cambia y el historial reciente sigue completo.
- Textos: material 30, marca 40, color 40, ubicación 60, notas 1000, nota de movimiento 120.

## El contrato del adaptador (src/spoolsStore.js)

Todos los métodos son asíncronos, como los de ordersStore.js.

| Método | Devuelve | Reglas |
|---|---|---|
| `load()` | `{ spools, movements }` | Validados. Bobinas por material y color; movimientos del más viejo al más nuevo. |
| `nextSpoolCode()` | entero | Nunca se repite y nunca baja, aunque se borren bobinas. |
| `saveSpool(spool)` | la bobina guardada | Inserta o actualiza por `id`. Nunca cambia `code`. |
| `deleteSpool(id)` | — | Solo si no tiene movimientos de pedidos. Si los tiene, se archiva. |
| `addMovements(list)` | los guardados | Todos o ninguno (atómico). Comprueba la regla de idempotencia. |

Si una escritura falla, lanza `StoreError`, igual que en los pedidos.

## Esquema para Supabase (lo escribe Julen, después de docs/TALLER.md)

Producción y finanzas van separadas, por la misma razón que en los pedidos: RLS filtra filas, no columnas, y el operario no tiene que ver lo que costó una bobina.

| Tabla | Grupo | Columnas |
|---|---|---|
| `spools` | producción | `id`, `workspace_id`, `code int`, `material`, `brand`, `color`, `color_hex`, `diameter numeric(4,2)`, `net_weight numeric(8,1)`, `tare_weight numeric(8,1) null`, `purchased_at date null`, `location`, `low_stock_grams`, `archived bool`, `notes`, `created_at`, `updated_at`; `unique (workspace_id, code)` |
| `spool_prices` | finanzas | `spool_id pk references spools on delete cascade`, `workspace_id`, `price numeric(10,2) >= 0` |
| `spool_movements` | producción | `id`, `spool_id … on delete restrict`, `workspace_id`, `at`, `type`, `grams numeric(8,1)`, `order_id null`, `line_id null`, `note`, `actor_id`; solo insert |
| `spool_counters` | — | `workspace_id pk`, `last_code int`, para `next_spool_code(p_workspace_id)`, igual que `next_order_number` |

- **El operario pesa bobinas.** Es lo único que escribe, y lo hace con `record_spool_weight(p_spool_id uuid, p_gross_grams numeric)`. Es `security definer`, comprueba dentro que es miembro del taller e inserta el `adjust`. Es el mismo patrón que `set_order_status`.
- **`consume` y `reverse` los escribe `save_order`** dentro de su transacción, al ver el cambio de estado. Así un pedido marcado «Listo» y su descuento no pueden quedar a medias.
- **`on delete restrict` en los movimientos:** una bobina con historial no se borra, se archiva.

## Etiquetas (las hace Julen)

Lo que el modelo garantiza para que el diseño de las etiquetas no dependa de nada más:
- **`code`** es corto, estable y único en el taller. Se enseña como `B-0007` y es lo que se escribe a mano o se lee en voz alta.
- **La URL del QR** es `https://layercents.com/?view=inventory&spool=<id>`. Abre esa bobina con «Pesar» a mano. Es el mismo esquema `?view=…&order=…` que ya usa route.js, y la ruta la añade el PR de la pestaña.
- En la etiqueta van material, color (con `colorHex`), marca, diámetro, `code` y el QR. El precio no va: la etiqueta la ve cualquiera en el taller.

## Plan de PRs

1. **Este documento** (`feature/inventory-design`). Julen lo revisa antes de escribir código.
2. **Modelo y adaptador local:** src/spools.js, src/spoolsStore.js, tests y backup.js (claves `spools`, `spoolMovements` y `spoolCounter`). Son claves nuevas y opcionales: si una versión vieja no las conoce, las ignora, así que en principio no hace falta subir `BACKUP_SCHEMA_VERSION`. Se comprueba en ese PR.
3. **Pestaña Inventario:** lista agrupada por material, alta y edición, pesar, aviso de poco stock y «se acaba antes del pedido #0012». Ruta `?view=inventory&spool=<id>`.
4. **Calculadora:** elegir la bobina de cada filamento rellena precio y peso, y avisa si no alcanza.
5. **Pedidos:** las líneas copian `filaments`, y el cambio de estado reserva, descuenta o revierte.
6. **Gramos reales de la Bambu**, cuando exista el paso 5 de impresoras (FTPS + `parseSliceInfo`). Un trabajo terminado propone su consumo real para la línea, y la persona lo confirma.

## Abierto

- **Bobinas compradas en lote.** ¿Se da de alta cada una por separado o con un «duplicar ×N»? Propuesta: duplicar ×N, con un `code` distinto por bobina, porque cada etiqueta es física.
- **El AMS.** ¿Vale la pena leer qué bobina hay en cada ranura desde el agente (el MQTT de Bambu trae `ams.tray`)? Después del paso 6, y solo para sugerir. Nunca cambia el stock sin confirmación.
