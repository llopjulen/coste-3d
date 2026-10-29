# Mapa del código de layercents

Para orientarse antes de leer un archivo: qué hace cada pieza, cómo viajan los datos, qué se guarda y dónde tocar para cada cambio. Se actualiza en cada PR que añada archivos, claves de localStorage o cambie el flujo de datos.

## La arquitectura en un párrafo

Es una SPA (single-page application) de React 19 compilada con Vite 8, sin backend (cuentas y nube están en camino, ver `docs/NUBE.md`; `supabase/` ya tiene el esquema pero la web aún no lo usa): todo se ejecuta en el navegador y los datos persisten en `localStorage`. Un único componente raíz, `App`, tiene el estado y decide qué pantalla se ve. El resto de componentes son casi todos presentacionales: reciben datos por props y avisan hacia arriba con callbacks (`onLoad`, `onDelete`…). Es flujo de datos unidireccional: los datos bajan, los eventos suben. La única excepción son los datos del negocio y el contador de presupuestos, que `CustomerQuote` lee y escribe directamente en `localStorage`.

## Orden recomendado de lectura

1. `src/main.jsx` (10 líneas): cómo arranca React.
2. `src/App.jsx`, secciones 1 y 2: la definición de los campos (`SECTIONS`) y `calculate()`. Es el corazón del producto y no tiene nada de React.
3. `src/App.jsx`, sección 4: el estado y cómo se elige la pantalla.
4. `src/History.jsx`: el componente más típico (props entrantes, callbacks salientes, estado local solo para la UI).
5. `src/slicerFile.js`: parsing con expresiones regulares; independiente de React.
6. El resto según lo que vayas a tocar.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | El shell: metadatos para buscadores y para compartir (título, descripción, `canonical`, Open Graph, datos estructurados JSON-LD), fuentes de Google, Cloudflare Web Analytics y el `<div id="root">` donde React pinta todo. Dentro de `#root` hay un `<h1>` y un párrafo de respaldo para quien lea el HTML sin ejecutar JavaScript; React lo reemplaza al arrancar. |
| `src/main.jsx` | Punto de entrada. Importa `index.css`, lee y quita el `?agent` de la dirección (una vez por carga) y monta `<App>` dentro de `<StrictMode>`. En desarrollo, StrictMode ejecuta dos veces renders y efectos para destapar efectos secundarios mal hechos; en producción no hace nada. |
| `src/App.jsx` | Estado global, cálculo y navegación. Cuatro secciones: 1) campos (`SECTIONS`, `INITIAL`) y colores del gráfico (`LAYERS`, en el orden en que se imprime: de abajo arriba); 2) `calculate(d)`; 3) componentes pequeños (`Field`, `SiteFooter`); 4) `App`. |
| `src/History.jsx` | Lista de presupuestos: tarjetas resumen, buscador, tabla agrupada por mes, marcar piezas para el presupuesto de cliente, Load y borrar. No es dueño de ningún dato. |
| `src/Report.jsx` | Informe imprimible (KPIs y 3 gráficas hechas con `div` y porcentajes, sin librería de gráficas). El PDF sale de `window.print()`. |
| `src/CustomerQuote.jsx` | Presupuesto para el cliente: formulario arriba, hoja abajo. Lee y escribe `business` y `quoteCounter`. Calcula en céntimos enteros. |
| `src/ImportFile.jsx` | Panel "Import from your slicer": arrastrar y soltar en toda la página, elegir bandeja y número de piezas, Undo. |
| `src/slicerFile.js` | Parser de `.gcode`, `.bgcode` y `.gcode.3mf`. Funciones puras (`parseSlicerText`, `parseSliceInfo`, `formValuesFromPlates`) más la lectura del `File` (`readSlicedFile`). |
| `src/exportExcel.js` | Export `.xlsx` con formato y fórmulas `SUM`. Se carga solo al pulsar el botón. |
| `src/backup.js` | Copia de seguridad: funciones puras (construir, validar, fusionar, planificar, recordatorio) y capa de almacenamiento (`writeAtomically`, `applyRestore`, `downloadBackup`). |
| `src/BackupPanel.jsx` | Panel "Backup" al final de History y aviso `BackupReminder` encima. |
| `src/agent.js` | Cliente del agente local: `checkAgent()` (¿está corriendo y habla nuestro protocolo?), `fetchPrinters()` (estado de las impresoras) y la activación por enlace (`?agent`). Sin React. |
| `src/agent.test.js` | Tests de contrato entre la web y el agente: `checkAgent` contra el código real de `agent/handler.js`. |
| `src/Printers.jsx` | Pestaña Printers (beta): estado del agente y, si está conectado, cada impresora en vivo (pide `/printers` cada 3 s solo mientras la pestaña está abierta y visible). Solo existe si la persona la activó. |
| `src/jobStats.js` | Funciones puras que resumen el registro de trabajos: tasa de fallos, tiempo medio, horas, piezas por semana y cuánto se desvía el tiempo real del que dijo el laminador (mediana, para que un trabajo atascado no mande). Tres reglas: los cancelados y desconocidos no cuentan como fallo ni como éxito, solo cuentan tiempos medidos, y con menos de 5 impresiones no se enseñan porcentajes. Tests en `jobStats.test.js`. |
| `src/printerView.js` | Funciones puras para poner en palabras el estado de una impresora: etiquetas, "1 h 15 min", porcentaje, color de la insignia y la línea de capa y temperaturas. Tests en `printerView.test.js`. |
| `src/backup.test.js` | Tests de la parte "Your setup" de `backup.js`: ida y vuelta, copias antiguas sin `setup`, Merge/Replace, almacenamiento bloqueado. |
| `src/Logo.jsx` | El logo en SVG; los colores salen del CSS. |
| `src/NavIcons.jsx` | Iconos de línea (calculadora, historial, impresora, sol y luna) de la navegación. SVG en línea con `currentColor`; sin librería de iconos. |
| `src/SubNav.jsx` | El segundo nivel de la barra lateral: lista «On this page» bajo la pestaña Calculator, con salto a cada bloque del formulario y marca del bloque visible (scrollspy con `IntersectionObserver`). Solo en escritorio ancho. La lista `CALC_NAV` y los `id="sec-…"` están en `App.jsx`. |
| `src/i18n/index.js` | Núcleo de la traducción, sin React: idiomas (`en`, `es`, `fr`), detección (`?lang=`, elección guardada, navegador), `translate`/`fill`/`splitSlots` y el separador decimal. `READY` decide si el selector es visible. |
| `src/i18n/en.js`, `es.js`, `fr.js` | Los textos de la interfaz, `clave -> texto` con `{huecos}`. El inglés es la referencia; los tres deben tener las mismas claves (lo comprueba `i18n.test.js`). |
| `src/i18n/context.js`, `Provider.jsx` | `useI18n()` da `t`, `tr` (con elementos dentro), `lang`, `setLang`, `locale` y `decimal`. El Provider envuelve `<App />` en `main.jsx` y pone `<html lang>`. |
| `src/theme.js` | Tema claro u oscuro: lee la elección guardada o la del sistema, la pone en `<html data-theme>` y en el color de la barra del navegador. |
| `src/logoGeometry.js` | Las coordenadas de las capas del logo, como datos. Las leen el logo y la gráfica de costes, para que no se descuadren. |
| `src/symbolChart.js` | Función pura `symbolPieces`: reparte los costes sobre las 11 capas del símbolo (cada coste ocupa un trozo del largo total proporcional a su parte del coste). Sin React. |
| `src/symbolChart.test.js` | Tests de `symbolChart.js`: proporciones, orden, huecos entre colores, entradas raras (NaN, negativos, todo a 0). |
| `src/CostSymbol.jsx` | La gráfica "Breakdown": dibuja el símbolo con un `clipPath` por capa y un rectángulo por coste. Solo pinta; las cuentas están en `symbolChart.js`. |
| `src/index.css` | Todos los estilos. Arriba los tokens (`--fondo`, `--oro`…) en `:root`; luego una sección por pantalla, con comentarios en español. `@media print` decide qué sale en los PDF. |
| `public/` | Se copia tal cual a la web: `CNAME` (el dominio para GitHub Pages: no se borra), iconos e imagen para compartir, y para los buscadores `robots.txt` y `sitemap.xml` (cada página nueva añade su `<url>`). |
| `screenshots/` | Capturas del README. |
| `agent/server.js` | Arranque del agente local. `npm run agent`: lee las impresoras, se conecta a ellas y abre el puerto 31415 solo en `127.0.0.1`. `npm run agent -- add / list / remove`: pasa a `setup.js`. |
| `agent/setup.js` | Comandos de terminal para añadir, listar y quitar impresoras. `add` pide IP, número de serie y código de acceso, los prueba (`probeBambu`) y los guarda. |
| `agent/config.js` | Lee y guarda la lista de impresoras en `~/.layercents/printers.json` (fuera del proyecto, permisos 600) y valida cada campo al cargarla. |
| `agent/printers.js` | Un driver por impresora según su marca; `list()` devuelve el estado común de todas y cada cambio de estado se pasa al registro de trabajos. |
| `agent/drivers/moonraker.js` | Driver de Klipper/Moonraker: pregunta por HTTP cada 2 s (`getJson`, sin seguir redirecciones y con tope de tamaño), `printerStatus` (a estado común) e `historyToJobs` (el historial propio de Moonraker a trabajos). Solo lectura. |
| `agent/fakeMoonraker.js` | Una impresora Klipper de mentira para los tests: un servidor HTTP de verdad con los datos que fija cada test. |
| `agent/jobs.js` | Registro de trabajos: una máquina de estados por impresora (empieza al imprimir, acaba en `finished`, `failed` o `unknown`) que se guarda en `~/.layercents/jobs.json`. Un tiempo calculado nunca se presenta como medido (`startedApprox`). Para Bambu el registro se construye mirando cambios de estado (`observe`); para Moonraker se copia su historial (`importHistory`). |
| `agent/drivers/bambu.js` | Driver de Bambu Lab: TLS con la huella del certificado fijada, MQTT, `pushall`, fusión de las actualizaciones parciales, reconexión con esperas crecientes, y `printerStatus` (de mensaje de Bambu a estado común). |
| `agent/mqtt.js` | Cliente MQTT 3.1.1 mínimo y sin dependencias: codificar y leer paquetes (`PacketReader`) y una sesión (`MqttSession`) con login, suscripción, publicación y keepalive. |
| `agent/fakeBroker.js` | Una impresora de mentira para los tests: habla MQTT, graba lo que le mandan y contesta como una Bambu. |
| `agent/handler.js` | Qué responde el agente a cada petición: seguridad (Host, Origin, CORS, preflight) y rutas: `/health` y `/printers` (solo lectura). `PROTOCOL` es la versión del contrato con la web. |
| `supabase/migrations/20261028000000_init.sql` | Esquema de la base de datos en la nube (todavía sin conectar a la web): `quotes`, `business`, `agents`, `printers`, `printer_status`, `jobs`, `subscriptions`, `pairings`. Cada tabla con RLS y con los permisos de `anon` y `authenticated` quitados y devueltos uno a uno. Diseño en `docs/NUBE.md`. |
| `supabase/tests/prelude.sql` | Solo para los tests: crea en un Postgres normal lo que Supabase ya trae (roles `anon`, `authenticated`, `service_role`, `auth.users`, `auth.uid()`). |
| `supabase/rls.test.js` | Tests de las políticas contra un Postgres de verdad con `psql`. Se saltan si no existe `LAYERCENTS_TEST_PG`. |
| `agent/*.test.js` | Tests del agente con `node:test` (`npm test`), sin dependencias: HTTP (`handler`), MQTT byte a byte (`mqtt`), driver de Bambu con TLS de verdad (`bambu`; se saltan sin openssl), configuración (`config`), registro de trabajos (`jobs`, con reloj falso), driver de Moonraker (`moonraker`, contra HTTP de verdad) y el comando `add` de punta a punta (`setup`). |
| `docs/MAPA.md` | Este archivo. |
| `docs/IMPRESORAS.md` | Investigación por marca (Bambu, Klipper/Moonraker, Prusa, Creality, Elegoo, Anycubic, Flashforge, OctoPrint): protocolo, puerto, credenciales, qué se puede leer, y el orden del plan. |
| `docs/AUDITORIA-2026-10-28.md` | Auditoría técnica de diseño (accesibilidad, rendimiento, tokens, responsive, coherencia): nota, hallazgos P1/P2/P3 con su estado y orden recomendado de arreglos. |
| `CLAUDE.md`, `DEV_LOG.md` | Instrucciones del proyecto y registro de cada cambio con su porqué. |
| `PRODUCT.md` | Contexto de producto para la skill de diseño `impeccable`: usuarios, posicionamiento, contexto de uso, marca y principios. Sin decisiones visuales. |
| `DESIGN.md`, `.impeccable/design.json` | Sistema visual tal como está en `src/index.css`: colores con nombre y uso, tipografía, radios, profundidad, componentes y reglas. El JSON añade escalas de tono, movimiento y fragmentos de componentes para la skill `impeccable`. |

Restos de la plantilla de Vite que nada usa y se pueden borrar: `src/assets/` (hero.png, react.svg, vite.svg) y `public/icons.svg`.

## Flujo de datos

```
                 ┌──────────────────── App ─────────────────────┐
  Field ─onChange─► set(key) ─► d (valores del formulario)       │
  ImportFile ─onApply─► applyImport ─► d                        │
                 │   d ──► calculate(d) ──► r (se recalcula en  │
                 │                            cada render)      │
                 │   saveQuote: {…d, …r} ──► savedQuotes ──► useEffect ──► localStorage
                 │   view decide la pantalla: calculator │      │
                 │     history │ report │ quote │ printers     │
                 └───────┬──────────────┬───────────┬───────────┘
                         ▼              ▼           ▼
             History (quotes,      Report       CustomerQuote ◄──► localStorage
             onLoad, onDelete,     (quotes)     (quotes marcados)   business,
             onExport, onReport,                                    quoteCounter
             onCustomerQuote)
             BackupPanel / BackupReminder ──► backup.js ◄──► localStorage
  App.set (campos de "Your setup") ──► saveSetupField ──► localStorage `setup`
             Printers ──► agent.js ──fetch /health, /printers y /jobs──► agente en 127.0.0.1:31415
```

- `r` es estado derivado: no se guarda en `useState`, se recalcula con `calculate(d)` en cada render. Calcular es barato, y así nunca puede quedar desincronizado de `d`.
- "Your setup" (impresora, luz, tarifa, comisión, margen) se recuerda en el dispositivo: los campos de las secciones con `setup: true` en `SECTIONS`. Se guarda desde el manejador `set` (no desde un efecto), campo a campo y solo cuando la persona lo edita; así "Load" de un presupuesto viejo o importar un laminador, que llaman a `setD` directamente, nunca pisan lo guardado.
- `savedQuotes` se escribe en `localStorage` desde un `useEffect` con `[savedQuotes]` como dependencias: se ejecuta después de cada render en el que la lista cambió.
- `view` sustituye a un router: no hay una URL por pantalla (salvo `?agent`, que abre Printers y se borra de la dirección nada más leerse). Por eso recargar la página vuelve siempre a la calculadora y el botón Atrás del navegador no cambia de pantalla.

## El agente local (conexión con impresoras, en construcción)

La web no puede hablar con una impresora: el navegador solo habla MQTT por WebSocket, y la impresora no lo ofrece, y una página `https` no puede llamar a `http://192.168.x.x`. Por eso hay un segundo programa, el agente, que corre en un ordenador de la misma red:

```
  navegador (layercents.com)  ──HTTP──►  agente (127.0.0.1:31415)  ──MQTT/FTPS──►  impresora
         la web, sin backend               agent/, Node, sin nube         MQTT sobre TLS (Bambu)
```

Dentro del agente:

```
  server.js ──► handler.js  ── GET /printers ──►  printers.js ──► drivers/moonraker.js ──HTTP 7125──► impresora Klipper
                                                        │
                                                        └──────► drivers/bambu.js ──► mqtt.js ──TLS 8883──► impresora Bambu
                  │                                     ▲                  │ onStatus (cada cambio)
                  └───────── GET /jobs ──► jobs.js ◄────┼──────────────────┘
                                             │          │
                       ~/.layercents/jobs.json   config.js (~/.layercents/printers.json, permisos 600)
                                                        ▲
                                      setup.js (npm run agent -- add: prueba y guarda)
```

- Cada impresora tiene su driver, que mantiene la conexión abierta y va guardando el último estado. `/printers` solo lee ese estado de memoria: preguntar no molesta a la impresora.
- El estado que sale del agente es el mismo para todas las marcas (`printerStatus`) y nunca lleva la IP, el número de serie ni el código de acceso.
- Cada marca alimenta el registro como su impresora permite: la Bambu no guarda historial y el agente lo reconstruye mirando (`onStatus`); Klipper sí lo guarda y se copia tal cual (`onHistory`). Una impresión cancelada es un resultado propio (`cancelled`), distinto de un fallo.
- La Bambu no guarda historial, así que el agente lo apunta él: `jobs.js` recibe cada estado que produce el driver y solo toca el disco cuando un trabajo empieza o acaba, no en cada actualización de progreso. Si el agente estaba apagado cuando un trabajo acabó, ese trabajo queda como `unknown`, nunca como éxito ni como fallo. `/jobs` devuelve los últimos 500, el más nuevo primero.
- Las impresoras se añaden desde la terminal (`npm run agent -- add`), no desde la web: así el código de acceso no pasa por el navegador, y el agente no necesita ninguna ruta que cambie cosas.
- Detalles por marca y fuentes: `docs/IMPRESORAS.md`.

- Es otro proceso, no forma parte de la web: Vite no lo empaqueta porque nada de `src/` lo importa. Usa los mismos `node_modules` del proyecto.
- Solo escucha en `127.0.0.1`: nadie de la red puede llamarlo, solo este ordenador.
- Antes de responder comprueba tres cosas, por este orden:
  1. El `Host` tiene que ser `127.0.0.1:31415` o `localhost:31415`. Es la defensa contra DNS rebinding: una web maliciosa podría hacer que su dominio apunte a 127.0.0.1, y entonces el navegador trataría al agente como parte de esa web y se saltaría CORS.
  2. El `Origin` tiene que estar en `ALLOWED_ORIGINS` (la web publicada y los servidores de desarrollo). Si no, devuelve 403 antes de hacer nada: CORS solo impide que la página lea la respuesta, no que la petición se ejecute.
  3. El preflight (`OPTIONS`) responde a la Private Network Access de Chrome con `Access-Control-Allow-Private-Network: true`.
- `/health` devuelve `protocol`: la web se actualiza en cada despliegue, pero el agente de cada persona no, así que la web compara ese número para saber si el agente es compatible.

En la web (`src/agent.js` y `src/Printers.jsx`):

- La pestaña Printers solo existe si la persona la activa: con el enlace `layercents.com/?agent`, o en su navegador si ya la activó antes (clave `agentEnabled`). El motivo es que pedir algo a 127.0.0.1 desde una web pública hace que Chrome pregunte por permisos ("acceder a otras apps y servicios de este dispositivo"); si se comprobara en cada visita, ese aviso le saldría a todo el mundo. Sin activar la pestaña, la web no hace ni una sola petición al agente.
- `checkAgent()` nunca lanza: devuelve `connected`, `outdated`, `wrong` (otro programa en el puerto) u `offline`. Desde el código de la página no se puede distinguir un puerto cerrado de un CORS rechazado o de un permiso denegado: todo es un `fetch` que falla.
- Printers comprueba el agente al abrirse y con "Check again", no con un temporizador. Si dos comprobaciones se solapan, gana la última (un contador en `useRef`).

## Dinero y monedas

Todo se guarda en EUR. Al arrancar, `App` pide los tipos de cambio a `api.frankfurter.dev/v1` (datos del BCE) y los guarda en `rates`. `formatMoney` multiplica por `rates[currency]` solo al pintar. Si la API no responde, `rates` se queda en `{ EUR: 1 }` y la app funciona en euros. `CustomerQuote` convierte a céntimos enteros de la moneda en pantalla antes de sumar, para que las líneas sumen exactamente el total (con decimales binarios, `0.1 + 0.2 !== 0.3`).

## Qué se guarda en localStorage

| Clave | Contenido | La escribe | La lee |
|---|---|---|---|
| `savedQuotes` | Array de presupuestos (forma abajo) | `App` (efecto tras cada cambio) y `applyRestore` | `App` al arrancar |
| `business` | `{ name, contact, logo, notes, tax, validDays }`; `logo` es un data URL PNG de 480 × 200 px como mucho | `CustomerQuote.saveBusiness`, `applyRestore` | `CustomerQuote` al abrirse |
| `quoteCounter` | Entero: el siguiente número de presupuesto (2026-007) | `CustomerQuote.savePdf`, `applyRestore` (nunca lo baja) | `CustomerQuote` |
| `setup` | `{ campo: número }` con solo los campos de "Your setup" que la persona ha editado (`printerPrice`, `watts`, `hourlyRate`, `fee`…) | `App.set` (vía `saveSetupField`), `resetSetup`, `applyRestore` | `App` al arrancar (`readSetup`) |
| `lastBackupAt` | Fecha ISO de la última copia en este dispositivo; no va dentro de la copia | `downloadBackup`, `applyRestore` | `App` |
| `agentEnabled` | `'1'` si este navegador enseña la pestaña Printers; tampoco va en la copia | `agent.js` (`setAgentEnabled`, `consumeAgentOptIn`) | `App` al arrancar |
| `theme` | `'light'` o `'dark'`, la elección de tema de este dispositivo; si no existe, manda el sistema. Tampoco va en la copia | `theme.js` (`saveTheme`) | `index.html` (antes de pintar) y `App` |
| `lang` | `'en'`, `'es'` o `'fr'`, el idioma de la interfaz de este dispositivo. Tampoco va en la copia | `i18n/index.js` (`saveLang`) | `i18n/Provider.jsx` |

Forma de un presupuesto guardado:

```js
{
  id: 1791013259422,            // Date.now() al guardar: clave de React, id para borrar y fecha de respaldo
  createdAt: '2026-10-03T…Z',   // fecha ISO
  date: '3/10/2026',            // texto antiguo, ya no se usa para pintar
  name: 'Phone stand', client: 'Ana',
  inputs: { spoolPrice: 20, … },  // copia de d: lo que "Load" vuelve a poner en el formulario
  parts: { material: 0.9, … },    // las seis capas del coste
  cost: 5.22, price: 7.94, units: 1, orderTotal: 7.94,
}
```

Los presupuestos de la primera versión solo tienen `{ id, date, cost, price }`. Por eso el código usa `q.createdAt ?? q.id` para la fecha y `q.orderTotal ?? q.price` para el total, y "Load" está desactivado cuando falta `inputs`.

Los valores del formulario (`d`) no se guardan: al recargar vuelven a `INITIAL`.

## El cálculo: `calculate(d)`

Función pura en `src/App.jsx`: entran los valores del formulario y salen números, sin tocar React ni la pantalla.

- `material = (partGrams + purgeGrams) × spoolPrice / spoolWeight`
- `power = watts / 1000 × hours × kwhPrice` (kWh × precio)
- `depreciation = hours × printerPrice / lifespan` (amortización lineal por hora de uso)
- `failures = (material + power + depreciation) × failRate / 100`
- `labor = postMinutes / 60 × hourlyRate`, más `packaging`
- `cost` = la suma de las seis capas
- `recommendedPrice = cost × (1 + margin) / (1 − fee)`: la comisión de la plataforma se cobra sobre el precio final, así que se divide entre `(1 − fee)` en vez de multiplicar por `(1 + fee)`.
- `profit = currentPrice × (1 − fee) − cost` y `perHour = profit / hours`.

Simplificación a tener en cuenta: con una tasa de fallos `p`, el coste esperado por pieza buena es `base / (1 − p)` (hacen falta de media `1 / (1 − p)` intentos), no `base × (1 + p)`. Con el 8 % la diferencia es pequeña (8,7 % frente a 8 %); con el 30 % ya no (42,9 % frente a 30 %). Como los fallos suelen pararse a medias, `base × p` puede servir como estimación, pero conviene decidirlo a propósito.

## Patrones que se repiten

- **Inmutabilidad.** `{ ...obj }`, `[...arr]`, `arr.filter()`, `new Set(prev)`: siempre un objeto nuevo, nunca mutar el viejo, porque React detecta cambios comparando referencias (`Object.is`) y no contenidos.
- **Estado inicial perezoso.** `useState(() => leer())`: la función solo se ejecuta en el primer render. Se usa para leer `localStorage` una vez y no en cada render.
- **Componentes controlados y no controlados.** Los inputs de `Field` son controlados (`value` + `onChange`). Los precios de `CustomerQuote` son no controlados (`defaultValue`) con una `key` que cambia con la moneda para rehacerlos; así el cursor no salta al escribir.
- **Carga diferida.** `await import('./exportExcel.js')` y `await import('fflate')`: Vite los separa en otros archivos (code splitting) que solo se descargan cuando hacen falta, y la carga inicial es más ligera.
- **Fuentes propias.** Inter y Bricolage Grotesque salen del propio sitio (paquetes `@fontsource-variable/*`, importados en `src/main.jsx`), no de Google. Vite copia los `.woff2` a `dist/assets/` y el navegador solo baja los del alfabeto que se usa (`unicode-range`). Antes cada visita le mandaba su IP a Google.
- **PDF sin librería.** `window.print()` más `@media print` y la clase `.no-print`.
- **`localStorage` siempre dentro de `try/catch`.** Lanza excepciones si está bloqueado (modo privado) o lleno (`QuotaExceededError`).
- **`useRef` para listeners globales.** `ImportFile` registra `dragover` y `drop` en `window` una sola vez y llega a la `handleFile` más reciente a través de una ref, para que el listener no use una versión antigua de la función (stale closure).
- **Errores para la persona y errores de programa.** `ImportError` y `BackupError` llevan un mensaje que se enseña tal cual; cualquier otro error es un bug y va a la consola.

## Dónde tocar para…

| Quiero… | Dónde |
|---|---|
| Añadir o cambiar un campo del formulario, su ayuda o su valor por defecto | `SECTIONS` en `App.jsx` (y `calculate` si interviene en el coste) |
| Cambiar una fórmula | `calculate` en `App.jsx` |
| Decidir qué campos se recuerdan entre visitas | `setup: true` en la sección de `SECTIONS` (App.jsx); `backup.js` solo valida que sean números |
| Cambiar el orden o el contenido de lo que se ve en el resultado | el bloque `{/* --- Result --- */}` de `App` (precio grande, gráfica, veredicto, guardar) |
| Cambiar los colores o el orden de la gráfica de costes | `LAYERS` en `App.jsx` (el orden es de abajo arriba) |
| Cambiar la forma del símbolo (logo y gráfica a la vez) | `logoGeometry.js` |
| Cambiar colores o espaciado | tokens de `:root` en `index.css` |
| Soportar otro laminador | `parseSlicerText` en `slicerFile.js` |
| Añadir una columna al Excel | `buildColumns` en `exportExcel.js` |
| Cambiar la hoja del presupuesto | el `<article className="report quote-doc">` de `CustomerQuote.jsx` |
| Guardar algo nuevo en el navegador | la clave en su componente **y** en `backup.js` (copia y validación) |
| Cambiar el formato de la copia | subir `BACKUP_SCHEMA_VERSION` y añadir la migración en `MIGRATIONS` |

## Comandos y publicación

- `npm run dev`: servidor de desarrollo con recarga en caliente (HMR) en `localhost:5173`.
- `npm run build`: compila a `dist/` (JS minificado y separado en trozos).
- `npm run lint`: oxlint, con las reglas de hooks de React.
- `npm run agent`: arranca el agente local y se conecta a las impresoras guardadas. Para comprobarlo, abre `http://127.0.0.1:31415/health` o `/printers` en el navegador. Se para con Ctrl+C.
- `npm run agent -- add` (y `list`, `remove <id>`): gestiona las impresoras del agente.
- `npm test`: `node --test` busca y ejecuta todos los `*.test.js` del proyecto, con el test runner que ya trae Node. `--test-timeout=20000`: un test que se quede colgado falla a los 20 s en vez de bloquear la terminal.
- `npm run deploy`: `gh-pages` publica `dist/` en la rama `gh-pages`. GitHub Pages sirve esa rama y `public/CNAME` le dice el dominio; Cloudflare va delante y pone el HTTPS.
