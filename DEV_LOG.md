# DEV_LOG

Registro de cambios del proyecto. La entrada más nueva va arriba.

### 2026-10-28, Agente paso 6: impresoras Klipper (Moonraker)
- Archivo y sitio:
  - agent/drivers/moonraker.js (nuevo): `createMoonrakerDriver`, `getJson`, `printerStatus`, `historyToJobs`, `probeMoonraker`, `explain`. agent/fakeMoonraker.js (nuevo): impresora de mentira. agent/moonraker.test.js y agent/setup.test.js (nuevos).
  - agent/config.js: `checkPrinter` valida por marca (`BRAND_CHECKS`): `bambu` como antes y `moonraker` con `port` y `apiKey` opcionales.
  - agent/printers.js: `moonraker` entra en `DRIVERS`; cada driver recibe `onStatus` y `onHistory`.
  - agent/jobs.js: `importHistory()` y el resultado `cancelled`. agent/setup.js: `npm run agent -- add` pregunta la marca. agent/handler.js: `PROTOCOL` 4, `VERSION` 0.4.0. agent/drivers/bambu.js: `printMessage` en el estado y `Object.hasOwn`.
  - src/agent.js (`AGENT_PROTOCOL` 4), src/printerView.js (etiqueta «Cancelled») y src/Printers.jsx (una línea con el mensaje de Klipper cuando falla). supabase/migrations: `cancelled` entre los resultados válidos.
- Qué cambió: el agente entiende impresoras Klipper con Moonraker (Creality K1/K2, Elegoo Neptune 4, Qidi, Sovol, Voron…): estado en vivo y su historial de trabajos. Se añaden con `npm run agent -- add`, eligiendo la opción 2.
- Por qué:
  - Una sola API cubre muchas marcas. Y Moonraker guarda su propio historial con el inicio y el final reales, aunque el agente estuviera apagado. Por eso el registro no se adivina mirando cambios de estado, como en Bambu: el historial se copia (`importHistory`). Los tiempos de estas impresoras son medidos siempre (`startedApprox: false`).
  - Se pregunta cada 2 s (polling) y no por WebSocket: no hay conexión que mantener ni que reconectar, un fallo es solo una pregunta fallida, y no hace falta ninguna dependencia (`fetch` ya viene en Node). El coste es una petición pequeña cada 2 s a una máquina de la red local. Descartado el WebSocket por más código para el mismo resultado visible.
  - El historial se vuelve a leer solo cuando una impresión empieza o acaba, no en cada pregunta. Si Moonraker aún no ha cerrado el registro justo al acabar, se mira otra vez en la siguiente vuelta; si no, el trabajo se quedaría abierto para siempre.
  - Solo GET, sin seguir redirecciones (`redirect: 'manual'`) y con tope de 2 MB por respuesta. La API key se manda en `X-Api-Key`: si la impresora redirigiera a otra dirección, un cliente que sigue redirecciones se la entregaría. Y un aparato equivocado en ese puerto no puede hacer que el agente lea gigas en memoria.
  - Solo HTTP, porque así viene Moonraker en la red local. Si una persona lo tiene detrás de HTTPS, el driver dice que esa dirección no responde como Moonraker en vez de fallar callado.
  - `cancelled` es un resultado propio. Klipper dice sin ambigüedad cuándo una impresión se canceló, y cancelar es una decisión de la persona, no un fallo de la impresora: si contara como fallo, la tasa de fallos (que es lo que se quiere enseñar) saldría inflada. `interrupted` y `server_exit` (se paró Moonraker, no la impresión) quedan como `unknown`.
  - El tiempo restante de Klipper es una estimación por el ritmo (`print_duration × (1−p) / p`), porque Moonraker no da ninguno. Se avisa en la checklist para que se compare con el del laminador.
  - La API key se guarda en `printers.json` (permisos 600, fuera del proyecto) igual que el código de las Bambu, nunca sale en el estado ni en `list`, y el comando no la repite en pantalla.
  - `Object.hasOwn(TABLA, valor)` en vez de `TABLA[valor]`: con `TABLA['constructor']` JavaScript devolvería el método de `Object` y se tomaría por un estado válido. Los datos vienen de un aparato de la red, no de una fuente de confianza.
  - Los tests sacaron un fallo real: `importHistory` se rompía con una entrada nula. Ahora cualquier entrada mala se salta.
  - Límite honesto: lo probado es contra una impresora de mentira que habla como dice la documentación de Moonraker. No sé cómo se comporta una K2 o una Neptune 4 reales (firmware, puertos, si exigen clave). Hace falta una persona con una: checklist en docs/IMPRESORAS.md.
- Concepto nuevo: polling con retroceso exponencial. En vez de preguntar cada 2 s siempre, tras cada fallo se espera el doble (2, 4, 8… hasta 60 s) y al primer éxito se vuelve a 2 s. Ejemplo: `espera = backoffMs[Math.min(intento - 1, backoffMs.length - 1)]`.
- De la carrera: Redes: HTTP, códigos de estado (401, 503, 3xx) y el porqué de no seguir redirecciones al enviar credenciales. Sistemas Operativos / Programación concurrente: un bucle asíncrono con temporizador que se cancela con `stop()` sin esperar. Ingeniería del Software: el patrón «una interfaz, un driver por marca» (`printerStatus` común) y probar contra un doble de prueba (`fakeMoonraker.js`). Estadística: separar `cancelled` de `failed` es decidir qué cuenta como éxito en una tasa.
- Cómo probarlo:
  1. `npm test` (133 pasan, 16 se saltan sin Postgres) y `npm run build`.
  2. Sin impresora: no se puede ver más allá de los tests. Con una Klipper, la checklist de docs/IMPRESORAS.md («Qué probar con una impresora Klipper»).
  3. Para ver el asistente sin impresora: `npm run agent -- add` y elige 2 con una IP que no responda: debe decirte qué falló y no guardar nada.

### 2026-10-28, Esquema de Supabase con seguridad por filas y sus tests
- Archivo y sitio:
  - supabase/migrations/20261028000000_init.sql (nuevo): 8 tablas, 3 triggers, permisos y políticas.
  - supabase/tests/prelude.sql (nuevo) y supabase/rls.test.js (nuevo): 16 tests contra un Postgres de verdad.
  - docs/MAPA.md al día. La web y el agente no cambian todavía: nada usa estas tablas.
- Qué cambió: queda definido dónde vivirá todo lo de la nube (presupuestos, negocio, agentes, impresoras, estado, trabajos, suscripciones y códigos de emparejamiento) y quién puede leer o escribir cada cosa.
- Por qué:
  - La `anon key` de Supabase va en el JavaScript de la web y es pública. Lo único que separa los datos de un usuario de los de otro es RLS. Por eso es lo primero que se escribe y se prueba, antes de que haya una sola línea de interfaz.
  - Dos cerrojos, no uno. Supabase da por defecto todos los permisos de tabla a `anon` y `authenticated`; el archivo empieza quitándolos todos y devuelve solo lo necesario. Aunque se olvide una política, la tabla no queda abierta. Y un test comprueba que todas las tablas tienen RLS.
  - Las tablas que un usuario no debe poder falsear (estado, trabajos, impresoras, suscripciones) no tienen permiso de escritura para la web: las escriben Edge Functions con la clave de servicio. Si no, cualquiera podría ponerse un historial de 0 % de fallos.
  - `token_hash` no se puede leer desde la web (permisos por columna) y se guarda como SHA-256: ni un volcado de la base de datos ni una cuenta robada permiten suplantar al agente. Un agente revocado no se puede reactivar (trigger); se vincula uno nuevo.
  - Borrado con marca (`deleted_at`) en los presupuestos: con dos dispositivos, una fila que desaparece parece «este dispositivo nunca la tuvo» y reaparece en la siguiente sincronización.
  - Los trabajos llevan `jobs_real_needs_measured_start`: un inicio estimado no puede tener tiempo «real». La regla de `agent/jobs.js` queda también garantizada en la base de datos.
  - `local_id` de las impresoras solo admite el formato de identificador del agente (`p1s-taller`), así que ni una IP ni un número de serie caben ahí por error.
  - Un tope de 20 impresoras por cuenta en un trigger, además del de la función de subida: un fallo allí no debe poder llenar la tabla.
  - `(select auth.uid())` en vez de `auth.uid()` en las políticas: Postgres lo calcula una vez por consulta y no una vez por fila.
  - Descartado: guardar los presupuestos en columnas. Cambian de forma con la app; `payload jsonb` con `schema_version` evita una migración por cada campo nuevo, igual que `BACKUP_SCHEMA_VERSION` en backup.js.
  - Los tests no tocan Supabase: usan un Postgres local con un `prelude.sql` que imita lo que Supabase ya trae. Para comprobar que los tests sirven, se rompió la seguridad a propósito (RLS apagado, permisos sin quitar, `token_hash` legible, escritura abierta en `jobs`) y cada ruptura hizo fallar tests. Una cosa no se detecta, y es correcta: quitar `with check` de una política `for all` no cambia nada, porque Postgres reutiliza `using`.
  - Límite honesto: esto demuestra que las políticas hacen lo que digo en un Postgres 16 normal, no que el panel de Supabase no tenga una configuración que las anule. Eso se comprueba una vez con el proyecto real.
- Concepto nuevo: permisos por columna. `grant select (id, name) on agents to authenticated` deja leer solo esas columnas; `select *` falla con «permission denied» porque incluye una que no se concedió. Es lo que esconde `token_hash`.
- De la carrera: Bases de datos: restricciones `check`, claves primarias compuestas, `on delete cascade`, triggers y transacciones. Seguridad informática: mínimo privilegio (todo cerrado, se abre lo necesario), separación de privilegios (la web lee, la función escribe) y no guardar secretos en claro (solo el hash del token).
- Cómo probarlo:
  1. `npm test`: 103 pasan y 16 se saltan (los de la base de datos).
  2. Con un Postgres a mano: `LAYERCENTS_TEST_PG=postgres://usuario:clave@localhost:5432/postgres npm test`. Deben pasar los 16. Crea y borra una base de datos temporal. Necesita `psql` instalado.
  3. Rompe algo a propósito en el .sql (por ejemplo, borra una línea `enable row level security`) y mira cómo fallan los tests.

### 2026-10-28, Diseño de cuentas, nube y cobro (solo documentación)
- Archivo y sitio: docs/NUBE.md (nuevo) y CLAUDE.md, regla «No metas backend…», «Pendiente» punto 5 e «Ideas futuras».
- Qué cambió: no hay código. Queda escrito el diseño de las cuentas con Supabase, la subida de estado y trabajos de las impresoras a la cuenta, el cobro con Lemon Squeezy, el modelo de seguridad y el orden de PRs. CLAUDE.md pasa a permitir esa excepción, con condiciones.
- Por qué:
  - Julen decidió ir a un producto de pago con cuentas, y eso rompe una regla que estaba para evitar justamente esto. Mejor cambiarla por escrito, con sus límites, que que cada sesión la interprete a su manera.
  - Supabase en vez de un servidor propio: Postgres, login y funciones sin un servidor que parchear, copiar y reiniciar, para alguien que trabaja a jornada completa. Descartado el backend propio por ese mantenimiento.
  - El agente sube estado y trabajos, pero nunca el código de acceso, la serie, la IP ni la huella. Un token robado solo debe poder escribir datos de impresoras de esa cuenta, no leer presupuestos: por eso el agente usa su propio token y no la sesión de la persona.
  - El token del agente se guarda hasheado (SHA-256) en la base de datos: un volcado no permite suplantar agentes. Es el mismo motivo por el que no se guardan contraseñas en claro.
  - Lo de pago se comprueba en el servidor. El código es público, así que ocultar un botón en el cliente no protege nada. Por eso Excel y PDF no sirven como función de pago.
  - Qué es de pago y el precio quedan fuera del repositorio (es público) y van en el documento privado.
  - Descartado: dejar los datos de impresoras solo locales. Es más privado, pero «ver todo desde cualquier sitio» es lo que se puede cobrar.
- Concepto nuevo: Row Level Security (RLS). Es una regla dentro de la base de datos que filtra las filas según quién pregunta, así que aunque la web tuviera un fallo, un usuario no puede leer filas de otro. Ejemplo: `create policy "own rows" on quotes using (user_id = auth.uid());`.
- De la carrera: Seguridad informática / Redes: el emparejamiento del agente es el «device flow» de OAuth, y guardar solo el hash del token es el mismo principio que el almacenamiento de contraseñas. Bases de datos: control de acceso por filas (RLS) y `on delete cascade` para el borrado de cuenta. Ingeniería del Software: decisiones de arquitectura escritas con sus alternativas descartadas.
- Cómo probarlo: no cambia la app. Léelo y dime qué no te cuadra antes del siguiente PR, que son las tablas y las políticas RLS.
### 2026-10-28, Agente paso 4: registro de trabajos de Bambu
- Archivo y sitio:
  - agent/jobs.js (nuevo): `openJobLog()` con `observe(status)`, `list()` y `flush()`; `checkJob()` valida cada entrada del archivo. agent/jobs.test.js (nuevo): 15 tests con reloj falso.
  - agent/drivers/bambu.js: opción `onStatus` de `createBambuDriver`, llamada dentro de `onReport`; `jobId()` y el campo `job.id` en `printerStatus`.
  - agent/printers.js: `createPrinters` recibe `jobLog` y se lo pasa a cada driver como `onStatus`.
  - agent/handler.js: ruta `GET /jobs`; `PROTOCOL` pasa a 3 y `VERSION` a 0.3.0. agent/server.js: abre el registro, se lo da al handler y espera a `flush()` en Ctrl+C. src/agent.js: `AGENT_PROTOCOL` = 3.
  - agent/config.js: `writePrivateJson()` sacada de `writeConfig` para que la usen las impresoras y los trabajos.
  - docs/IMPRESORAS.md (checklist 7-11), docs/MAPA.md y CLAUDE.md al día.
- Qué cambió: el agente apunta en `~/.layercents/jobs.json` cada trabajo que ve en una Bambu (impresora, nombre, inicio, fin, resultado, minutos estimados y reales, código de error) y lo sirve en `GET /jobs`, el más nuevo primero.
- Por qué:
  - La Bambu no guarda historial: cuando un trabajo acaba, lo olvida. Sin este registro no se puede comparar lo presupuestado con lo que pasó de verdad, que es lo que ninguna calculadora de la competencia hace.
  - El driver avisa con un callback (`onStatus`) en cuanto llega un mensaje, en vez de que el registro pregunte cada X segundos: no se pierde ningún cambio ni se hace trabajo en vacío. Se llama dentro de un `try/catch`, porque un fallo del registro no debe dejar sin estado en vivo a la web.
  - Solo se escribe en disco cuando un trabajo empieza o acaba, no con cada porcentaje: la P1S manda varios mensajes por segundo.
  - Resultado `unknown` cuando no se vio cómo acabó (el agente estaba apagado, la impresora pasó a reposo, otro trabajo ocupó su sitio). Descartado asumir `finished`: un éxito inventado falsea la tasa de fallos.
  - Si el agente arranca con una impresión a medias, el inicio se estima con el progreso y el tiempo restante que da la propia impresora, se marca `startedApprox` y no se calcula `realMinutes`. Un tiempo calculado nunca se presenta como medido, o "presupuestado frente a real" sería un círculo.
  - El reloj empieza en `PREPARE` si se vio, porque la estimación de la Bambu incluye el calentamiento y la calibración.
  - La clave del trabajo (id de Bambu o nombre del archivo) se guarda en el archivo. Si solo estuviera en memoria, tras reiniciar el agente un trabajo nuevo se confundiría con el que quedó abierto.
  - Un archivo roto se aparta como `jobs.json.broken-<hora>` en vez de sobrescribirse, y las entradas dañadas se saltan y se avisan. Un fallo al guardar se registra pero no se lanza: una promesa rechazada sin atender detiene un programa de Node.
  - Las escrituras se encadenan (`saving = saving.then(...)`) para que dos no se pisen en el mismo archivo temporal.
  - `PROTOCOL` sube a 3 porque la API cambia (ruta nueva y `job.id`), como pide CLAUDE.md. Con la comparación estricta de la web, un agente viejo saldrá como "outdated" hasta que lo actualices.
  - Descartado: guardar los trabajos en el navegador (el agente puede llevar días sin web abierta) y SQLite (una dependencia más para un archivo que crece unas decenas de filas a la semana).
- Concepto nuevo: encadenar promesas para serializar escrituras. `let cola = Promise.resolve(); cola = cola.then(() => escribir())` hace que cada escritura espere a que acabe la anterior, aunque se pidan a la vez. Y `.catch` al final de la cadena evita que un error rompa las siguientes.
- De la carrera: Autómatas / Teoría de la computación: `observe()` es un autómata finito por impresora (estados: sin trabajo y abierto; las transiciones están en el dibujo de la cabecera de jobs.js). Bases de datos: `writePrivateJson` escribe en un temporal y hace `rename`, que es atómico; el archivo es el anterior o el nuevo entero, igual que un commit o un rollback. Sistemas Operativos: los permisos 600 del archivo y esperar a `flush()` antes de salir en la señal SIGINT.
- Cómo probarlo:
  1. `npm test` (103 tests) y `npm run build`.
  2. Con la P1S: sigue la checklist de docs/IMPRESORAS.md (puntos 7 a 11). Lo más importante: lanza una impresión corta y mira `http://127.0.0.1:31415/jobs`, y **cancela otra a mitad** para ver cómo la cuenta Bambu.
  3. Sin impresora: `npm run agent` y abre `/jobs`; debe salir `{"jobs":[]}`.

### 2026-10-26, El PDF ya no sale con un bloque negro debajo de la hoja
- Archivo y sitio: src/index.css, sección "Informe (PDF)", dentro de `@media print`, en la regla del fondo (antes solo `body`, ahora `html,body`).
- Qué cambió: al imprimir, el fondo blanco se pone también en `html`. Desde el PR del SEO (#16), el informe y el presupuesto para el cliente salían con un bloque negro desde la última línea hasta el final de la hoja. No llegó a la web publicada: layercents.com se desplegó el 22 y el SEO entró después.
- Por qué:
  - El SEO (commit 5b6b732) puso en index.html un `<style>` que pinta `html` y `body` de oscuro antes de que cargue index.css, para que no haya un destello blanco al abrir la web. Al imprimir, index.css volvía a poner `body` en blanco, pero nadie tocaba `html`.
  - El fondo de `html` no es solo el de su caja: es el de todo el lienzo, la hoja entera. Y `*{print-color-adjust:exact}`, que hace falta para que salgan las barras de oro, obliga a imprimir los fondos aunque el diálogo de impresión tenga desactivados los gráficos de fondo. Así que el oscuro de `html` llegaba al papel por debajo del `body` blanco.
  - Descartado quitar `html` del `<style>` de index.html: también lo arreglaría (sin fondo propio, `html` toma el de `body`), pero dejaría el arreglo lejos de las reglas de impresión, y se rompería otra vez el día que alguien le diera fondo a `html`. Mejor decirlo donde se decide cómo se imprime.
  - Descartado quitar `print-color-adjust:exact`: arregla el fondo, pero se pierden las barras de oro de las gráficas del informe.
- Concepto nuevo: el fondo del lienzo. El navegador pinta toda la ventana (o toda la hoja, al imprimir) con el fondo de `html`; si `html` no tiene, usa el de `body`. Por eso el fondo de `body` llena la pantalla aunque el `body` mida menos. Ejemplo: con `html{background:red}` y `body{background:white;height:100px}`, la página es roja con una franja blanca arriba, que es justo lo que pasaba en el papel con el oscuro.
- De la carrera: Introducción a la Ingeniería del Software, las pruebas de regresión. Esto es una regresión, un cambio (el SEO) que rompe algo que ya funcionaba (imprimir) en una parte que el cambio ni tocaba. Ningún test imprime, así que nadie lo vio; el "Cómo probarlo" de abajo hace de prueba de regresión a mano.
- Cómo probarlo:
  1. `npm run dev` y guarda dos presupuestos con cliente.
  2. History, marca los dos y pulsa "Customer quote"; luego "Save as PDF". En la vista previa de impresión, debajo de "Quote made with layercents" la hoja sigue blanca hasta abajo. Antes, ahí empezaba el bloque negro.
  3. Lo mismo con "PDF report": blanco hasta el final y las barras de oro siguen saliendo.

### 2026-10-25, CLAUDE.md: cada cambio dice de qué asignatura de la carrera viene
- Archivo y sitio: CLAUDE.md, sección "Regla principal: registro de cambios", en el formato de las entradas.
- Qué cambió: las entradas de este registro tienen una línea nueva, "De la carrera", que dice qué asignatura explica lo que usa el cambio y dónde se ve en el código. Si no hay ninguna, no se pone.
- Por qué: la carrera enseña los conceptos y el proyecto las herramientas, pero nadie une las dos cosas. Con esta línea, cada PR es un ejemplo práctico del temario: la codificación de longitudes de MQTT es de Sistemas digitales, `writeAtomically` es una transacción de Bases de datos, el Ctrl+C del agente es una señal de Sistemas Operativos, y el arreglo pendiente de las impresiones fallidas (base / (1 − p)) es la esperanza de una distribución geométrica de Estadística. Va en CLAUDE.md porque es lo que lee cada sesión nueva de Claude Code; si solo se dijera en una conversación, se perdería.
- Cómo probarlo: no cambia la app. En el próximo PR que toque código, su entrada del DEV_LOG debe llevar la línea "De la carrera".

### 2026-10-25, Pestaña Printers: cada impresora en vivo
- Archivo y sitio:
  - src/agent.js: `fetchPrinters()`, junto a `checkAgent`.
  - src/printerView.js (nuevo): etiquetas, tiempo restante ("1 h 15 min"), porcentaje, color de la insignia y la línea de capa y temperaturas. src/printerView.test.js (nuevo): 4 tests.
  - src/Printers.jsx: componente `PrinterCard` y, dentro de `Printers`, el estado `printers` y un efecto que refresca la lista cada 3 s mientras el agente está conectado. El panel "Your printers" va encima del panel del agente.
  - src/agent.test.js: 2 tests de `fetchPrinters` contra el `handler.js` real del agente.
  - src/index.css, al final de "Impresoras (beta)": `.printers-body` y `.printer-*`.
  - docs/MAPA.md y CLAUDE.md: archivos, flujo y estado de hoy.
- Qué cambió: con el agente conectado, la pestaña Printers enseña cada impresora con su estado (Printing, Idle, Finished…), el nombre del trabajo, una barra de progreso con el %, el tiempo que falta, la capa y las temperaturas. Si la impresora no responde o el código está mal, la tarjeta lo dice con el mensaje del agente. Sin impresoras, explica cómo añadir una.
- Por qué:
  - Refresco cada 3 s con `fetch`, no con WebSocket ni Server-Sent Events: el agente contesta de memoria (no pregunta a la impresora en cada petición), así que es barato, y es el mismo `fetch` que ya usa `checkAgent`, con su timeout y su CORS. Un canal abierto sería más inmediato, pero el progreso de una impresión cambia más o menos una vez por minuto: no compensa la complejidad.
  - Solo pregunta mientras se ve: el efecto se limpia (`clearInterval`) al salir de la pestaña, y cada vuelta se salta si la pestaña del navegador está oculta (`document.visibilityState`). Mantiene la regla del paso 2: nada llama a 127.0.0.1 si nadie está mirando. Comprobado: al salir de la pestaña, cero peticiones.
  - Si `/printers` falla, se vuelve a comprobar el agente con `checkAgent`: así la pantalla pasa a "The agent isn't running" en vez de quedarse con datos viejos.
  - `cancelled` en el efecto: si la respuesta llega después de salir de la pestaña, no se toca el estado de un componente que ya no existe.
  - Las tarjetas no son una "live region": sus números cambian cada pocos segundos y un lector de pantalla no pararía de hablar. La barra sí lleva `role="progressbar"` con su valor, así que se lee bajo demanda.
  - La insignia lleva texto además de color ("Printing", "Offline", "Access code refused"), porque el color solo no lo distingue todo el mundo. Oro mientras trabaja, rojo si falló o el código está mal, gris si no se sabe; nada de verde, por la regla de la marca.
  - La lógica de presentación va en `printerView.js`, sin React, como `calculate()`: se prueba sola y el componente solo pinta.
- Concepto nuevo:
  - Limpieza de un efecto: la función que devuelve `useEffect` se ejecuta cuando el componente desaparece o cuando cambian sus dependencias. Ahí se paran los temporizadores; si no, seguirían vivos llamando al agente aunque ya no se vea la pestaña.
  - `document.visibilityState`: vale `'hidden'` cuando la pestaña del navegador no se ve (otra pestaña delante, el móvil bloqueado).
- Cómo se probó: 84 tests; y en Chromium sobre el build, con el agente real conectado a una impresora de mentira con TLS: la tarjeta pasa de 45 % a 60 % en 3,5 s, enseña "1 h 15 min left" y "Layer 12 of 300 · Nozzle 220 °C · Bed 60 °C", a 1440 y a 390 px; al ir a Calculator no hay más peticiones; al apagar la impresora de mentira, la tarjeta dice "Offline" con el motivo y sin la IP. Y por casualidad salió la prueba del certificado: la impresora de mentira genera uno nuevo cada vez que arranca, así que al reiniciarla la tarjeta dijo "Needs attention" y pidió volver a añadirla, sin mandarle el código. Tras `npm run agent -- add` de nuevo, volvió a conectar.
- Cómo probarlo:
  1. Con tu P1S añadida (`npm run agent -- add`), `npm run agent`.
  2. `npm run dev` y abre `http://localhost:5173/?agent`, pestaña Printers.
  3. Debe salir "P1S" con su estado. Lanza una impresión corta: la barra avanza sola.
  4. Apaga la impresora (o desconéctala de la red): en unos segundos la tarjeta dice "Offline" y que está reintentando. Al encenderla, vuelve sola.

### 2026-10-25, Agente, paso 3: estado en vivo de las Bambu por MQTT
- Archivo y sitio:
  - agent/mqtt.js (nuevo): cliente MQTT 3.1.1 mínimo, sin dependencias.
  - agent/drivers/bambu.js (nuevo): `openPinnedTls`, `createBambuDriver`, `explain`, `printerStatus` y `probeBambu`.
  - agent/config.js (nuevo): la lista de impresoras en `~/.layercents/printers.json`.
  - agent/printers.js (nuevo): un driver por impresora.
  - agent/setup.js (nuevo): `npm run agent -- add`, `list` y `remove`.
  - agent/server.js: distingue arrancar el agente de los comandos de `setup.js`; carga las impresoras, las conecta y las para con Ctrl+C.
  - agent/handler.js: ruta `GET /printers`; `/health` deja de llevar la lista de impresoras; `PROTOCOL` pasa a 2 y `VERSION` a 0.2.0.
  - src/agent.js: `AGENT_PROTOCOL` pasa a 2, para que la web y el agente sigan hablando la misma versión (el test de contrato lo exige).
  - agent/fakeBroker.js (nuevo) y agent/mqtt.test.js, agent/bambu.test.js, agent/config.test.js (nuevos): 32 tests. agent/handler.test.js: 2 más.
  - package.json: `npm test` con `--test-timeout=20000`.
  - docs/MAPA.md: archivos y flujo del agente.
- Qué cambió: el agente se conecta a las impresoras Bambu que se le añadan y mantiene su estado en vivo (imprimiendo o no, progreso, minutos restantes, capa, temperaturas). La web puede leerlo en `http://127.0.0.1:31415/printers`. Las impresoras se añaden con `npm run agent -- add`, que prueba la IP, el código y el número de serie antes de guardar nada. La pantalla de la web llega en el PR siguiente.
- Por qué:
  - **Solo lectura.** Desde 2025 Bambu exige autorización (o LAN only + Developer Mode) para controlar la impresora, pero leer su estado sigue permitido en modo normal (fuentes en docs/IMPRESORAS.md). El agente solo se suscribe y pide `pushall`; nunca manda órdenes. Así funciona sin que la persona pierda Bambu Handy.
  - **Un cliente MQTT propio en vez del paquete `mqtt` de npm.** El paquete trae unas 15 dependencias más a un programa que guarda los códigos de acceso de las impresoras, y en 2025 hubo varios ataques a la cadena de suministro de npm (paquetes populares secuestrados para robar secretos). Necesitamos 7 de los 14 tipos de paquete de MQTT 3.1.1: son unas 200 líneas, con cada byte comprobado en los tests contra la especificación. Lo que se pierde: QoS 2, reconexión automática y TLS ya hechos; lo primero no hace falta y lo demás está en el driver.
  - **El certificado de la impresora, fijado por su huella (como SSH).** Las Bambu presentan un certificado que no firma ninguna autoridad pública, así que la verificación normal de TLS siempre falla. Desactivarla sin más (lo que hacen muchas integraciones) dejaría que cualquiera en la misma red se hiciera pasar por la impresora y se llevara el código de acceso. Al añadir la impresora se guarda la huella SHA-256 de su certificado, y después solo se acepta ese. La comprobación ocurre ANTES de mandar el login MQTT: con un certificado distinto, el código no sale del ordenador (hay un test con TLS de verdad que lo comprueba). Si la huella cambia, el agente para y pide volver a añadirla; no reintenta solo, porque eso sería aceptar el cambio sin que nadie lo vea.
  - **La configuración fuera del proyecto** (`~/.layercents/printers.json`, carpeta 700 y archivo 600). Dentro del proyecto, un código de acceso podría acabar en un commit por error. Se escribe en un archivo temporal y se renombra (`rename` es atómico): si algo falla a medias, no se pierde la lista. Cada campo se valida al cargarla, porque el archivo se puede editar a mano.
  - **Añadir impresoras desde la terminal, no desde la web.** El código de acceso va del teclado al archivo sin pasar por una pestaña del navegador, y el agente no necesita ninguna ruta que cambie cosas (una ruta que escribe es una puerta mucho más grande que una que solo lee). Se pregunta en un prompt y no como argumento porque los argumentos quedan en el historial de la terminal. Antes de guardar se prueba todo (`probeBambu`): IP (responde TLS), código (el login MQTT se acepta) y número de serie (llega un estado por ese tema), y si algo falla se dice cuál.
  - **Actualizaciones parciales.** Las P1 y A1 solo mandan lo que cambia; el driver va fusionando (`{ ...anterior, ...nuevo }`) y pide `pushall` una vez por conexión, porque es pesado para la impresora.
  - **Reconexión con esperas crecientes** (2, 4, 8… hasta 60 s; 60 s si el código está mal): una impresora apagada toda la noche no recibe un intento cada segundo. El keepalive de MQTT (un PINGREQ cada 30 s) detecta una impresora que desaparece sin cerrar la conexión.
  - **Un estado común para todas las marcas** (`printerStatus`): la web no sabe qué marca es cada impresora, y añadir Moonraker o Prusa será añadir un archivo de driver. Nunca incluye la IP, el número de serie ni el código (hay un test).
  - **Los mensajes de error tampoco llevan la IP.** El texto de error de Node incluye la dirección (`connect ECONNREFUSED 192.168.1.50:8883`), así que `explain` usa solo el código del sistema (`ECONNREFUSED`) traducido a palabras ("is it switched on?"). Lo vi en la prueba de la pantalla, al apagar la impresora de mentira, y tiene su test.
  - **`PROTOCOL` 2.** La API cambió (ruta nueva y `/health` sin lista), y el test de contrato exige que web y agente digan el mismo número, así que `AGENT_PROTOCOL` sube en el mismo PR. Un agente viejo con la web nueva sale como "desactualizado" en vez de fallar raro.
  - **`--test-timeout=20000`:** con tests de red, un test que se quedara esperando un evento que nunca llega bloquearía `npm test` para siempre. Así falla a los 20 s con su nombre.
  - **Tests con una impresora de mentira** (`fakeBroker.js`): habla MQTT de verdad por un puerto aleatorio y graba lo que recibe. Los de TLS crean un certificado temporal con `openssl` y se saltan donde no está instalado (Windows, normalmente).
- Concepto nuevo:
  - **TLS y huella de certificado:** TLS cifra la conexión y el servidor enseña un certificado. La huella (`fingerprint256`) es un hash SHA-256 de ese certificado: si cambia un solo bit, cambia la huella. Comparar huellas es como comprobar la matrícula de un coche que ya conoces.
  - **Trust on first use (TOFU):** la primera vez se confía en lo que hay y se recuerda; después solo se acepta lo mismo. Es lo que hace `ssh` con el "The authenticity of host … can't be established".
  - **EventEmitter:** un objeto que avisa de cosas (`session.on('message', fn)`). Ojo: si se emite `'error'` y nadie escucha, Node lanza la excepción y para el programa; por eso todo el que usa `MqttSession` escucha `'error'`.
  - **Framing en TCP:** TCP entrega bytes, no mensajes. Un paquete puede llegar en tres trozos o tres paquetes en uno. `PacketReader` guarda lo que sobra y solo devuelve paquetes completos.
- Cómo se probó: 78 tests (`npm test`), y un recorrido completo con una impresora de mentira escuchando con TLS en 127.0.0.1:8883: `npm run agent -- add` con un código malo (dice que el código está mal y no guarda nada), con el bueno (guarda, carpeta 700 y archivo 600, número de serie en minúsculas y con espacio corregido), `list`, `npm run agent` y `/printers` devolviendo "printing" con el progreso subiendo, sin código ni serie en la respuesta, y Ctrl+C. Falta lo que solo puede hacer Julen: probarlo con su P1S.
- Cómo probarlo (con la P1S):
  1. En la impresora, apunta la IP, el número de serie (Ajustes > Dispositivo) y el código de acceso (Ajustes > WLAN, abajo).
  2. `npm run agent -- add` y contesta. Debe decir "✓ Connected. The printer says: IDLE" (o lo que esté haciendo).
  3. `npm run agent` y abre `http://127.0.0.1:31415/printers` en el navegador: tu P1S con `"connection": "online"`.
  4. Lanza una impresión: `state` pasa a `printing` y `progress` sube. Bambu Handy debe seguir funcionando.
  5. Si algo falla, copia lo que imprime la terminal del agente (no lleva el código).

### 2026-10-25, Guía de conexión de impresoras por marca (docs/IMPRESORAS.md)
- Archivo y sitio:
  - docs/IMPRESORAS.md (nuevo): la investigación completa, con 33 fuentes.
  - CLAUDE.md, sección "Conexión con impresoras": el plan pasa de 7 a 9 pasos y apunta a la guía. En "Pendiente", la prueba con un 3MF de Bambu queda hecha (la hizo Julen el 22 de octubre).
  - docs/MAPA.md: el archivo nuevo en la tabla.
- Qué cambió: hay un documento que explica, marca por marca, cómo se habla con cada impresora (protocolo, puerto, credencial), qué se puede leer sin cambiarle nada a la impresora, si guarda historial, de dónde salen los gramos reales, y en qué orden lo vamos a implementar.
- Por qué:
  - El paso 3 del plan decía "antes de nada, comprobar qué deja leer sin Developer Mode". La respuesta: leer el estado de una Bambu está permitido en todos los firmwares; lo restringido desde 2025 es controlarla. Eso decide el diseño: el agente solo lee, y así funciona con la impresora en modo normal sin quitarle a su dueño la app del móvil.
  - Orden por cuota de mercado y por trabajo: Bambu (la más vendida en 2025 y la de Julen), después Moonraker (un solo driver cubre media docena de marcas y trae el historial hecho), después Prusa (muy común en talleres europeos). Las marcas con protocolos sin documentar, solo cuando alguien que las tenga pueda probarlas.
  - Va en el repositorio y no en un documento aparte porque es la referencia técnica del agente: el código de cada driver la necesita, y cada sesión de Claude Code la encuentra desde CLAUDE.md. No tiene nada privado; el plan de pago, que sí lo es, no va aquí.
- Concepto nuevo: MQTT es el protocolo estándar del IoT industrial y doméstico. Un servidor (broker) recibe mensajes publicados en "temas" (`device/123/report`) y los reparte a quien esté suscrito. Ejemplo: la impresora publica su estado en su tema; el agente se suscribe a ese tema y recibe cada cambio sin tener que preguntar.
- Cómo probarlo: no cambia la app. Léelo en GitHub (se ve con formato) empezando por la tabla "Resumen" y la sección de Bambu.

### 2026-10-25, Copia de seguridad: un solo botón dorado y un texto que se entiende
- Archivo y sitio: src/BackupPanel.jsx, dentro de `BackupPanel`: el texto del panel y la clase del botón "Download backup".
- Qué cambió:
  - El texto decía "Download a backup now and then and keep it somewhere safe", que en inglés se lee a trompicones. Ahora: "Download a backup from time to time and keep it somewhere safe". Además nombra "setup", que va dentro de la copia desde que se guarda "Your setup".
  - Cuando toca hacer copia, el aviso de arriba ya tiene su botón dorado "Download backup". El del panel de abajo pasa a ser gris en ese caso, y sigue dorado cuando no hay aviso.
- Por qué: en el móvil se veían dos botones dorados iguales en la misma pantalla, y dos botones idénticos con el mismo peso visual parecen dos acciones distintas. El dorado es "lo que deberías hacer ahora", y solo debe estar en un sitio. Los dos siguen haciendo lo mismo (`onBackup`). Se usa `status.due`, que el panel ya calculaba con `backupStatus`: es exactamente la condición con la que el aviso aparece, así que no hay dos reglas que puedan contradecirse.
- Cómo probarlo:
  1. `npm run dev` en un navegador sin datos; guarda un presupuesto y abre History.
  2. Arriba sale el aviso con su botón dorado; abajo, en "Backup", el mismo botón es gris y el texto dice "from time to time".
  3. Pulsa cualquiera de los dos: se descarga la copia, el aviso desaparece y el botón de abajo vuelve a ser dorado.

### 2026-10-25, Informe: el mes de la gráfica ya no parece un día
- Archivo y sitio:
  - src/Report.jsx, en "Chart 1: quoted value per month": cada mes guarda `key`, `month` ("Oct"), `year` y si es enero; en el render, el año va debajo del mes en la primera barra y en cada enero.
  - src/index.css, sección de la gráfica de columnas: `.col` con `position: relative`, `.col-label` colgada por debajo del eje con `position: absolute`, `.col-year` y más margen bajo la gráfica.
- Qué cambió: las barras ponían "Oct 26", que se lee como "26 de octubre". Ahora pone "Oct" y debajo "2026" en la primera barra; los meses siguientes solo llevan el mes hasta que cambia el año, y en cada enero vuelve a salir el año.
- Por qué:
  - Formato `{ month: 'short', year: '2-digit' }` daba "Oct 26": ambiguo justo en un informe que se enseña a otros. Con el año entero en cada barra ("Oct 2026") no caben 12 etiquetas en un móvil ni en el ancho de un A4 sin pisarse. Poner el año solo donde empieza es lo que hacen las gráficas de series temporales: se sitúa cada mes sin repetir el año doce veces.
  - La etiqueta pasa a `position: absolute` por debajo del eje. Antes ocupaba sitio dentro de la columna (con un margen negativo que lo compensaba para una sola línea): una etiqueta de dos líneas habría subido su barra unos píxeles respecto a las demás. Comprobado: todas las barras acaban a la misma altura.
  - La `key` de React pasa a ser "2026-10" (año y mes) en vez del texto de la etiqueta: dos barras nunca pueden tener la misma clave, aunque se repita "Oct" en dos años distintos.
- Concepto nuevo: `position: absolute` dentro de un padre con `position: relative` coloca el elemento respecto a ese padre y lo saca del flujo: no empuja a nadie. `top: 100%` lo pone justo debajo del padre, y `left: 50%` con `transform: translateX(-50%)` lo centra.
- Cómo probarlo:
  1. `npm run dev`, guarda presupuestos y ábrelos en History > "PDF report".
  2. Bajo la gráfica: "Oct" y debajo "2026" en la primera barra. Si tienes presupuestos de varios años, "Jan" lleva el año debajo.
  3. Todas las barras arrancan del mismo eje, también en un móvil y al imprimir.

### 2026-10-25, History en el móvil: el importe de cada presupuesto a la vista
- Archivo y sitio:
  - src/History.jsx, en la tabla de cada mes: clase `wide` en las columnas Date, Client, Qty, Cost / part y Price / part (cabecera y celdas), clase `part` en la celda del nombre, y dentro de ella un `<span className="row-sub">` con cantidad, cliente y fecha.
  - src/index.css, junto a `.history-table .actions`: `.row-sub` oculto por defecto y un bloque `@media(max-width:600px)`.
- Qué cambió: en un móvil, cada fila enseña el nombre de la pieza, el importe del pedido y los botones, sin barra horizontal. Debajo del nombre aparece "10 pcs · Marc · 25 Oct 2026". En el ordenador la tabla es la misma de siempre.
- Por qué:
  - Antes, a 390 px solo se veían fecha, pieza y cliente. Los importes quedaban a la derecha, fuera de la pantalla, dentro de un contenedor con desplazamiento horizontal que no se ve. Justo lo que más importa (cuánto cobraste) era lo que no salía.
  - Se esconden columnas con CSS en vez de pintar otra lista para el móvil: el HTML es uno solo, así que los botones, las casillas y la accesibilidad (`aria-label` de cada fila) son los mismos en los dos tamaños, y no hay dos versiones que mantener a la vez.
  - Queda "Order total" y no "Price / part": es lo que vas a cobrar por ese presupuesto. La cantidad aparece en la línea de abajo cuando es más de 1, así se entiende por qué el total es mayor que el precio.
  - El nombre puede partirse en varias líneas (`white-space: normal` en `td.part`), porque la tabla entera hereda `nowrap` para el escritorio.
  - `.filter(Boolean)` quita los trozos vacíos (sin cliente, o 1 pieza), así no salen separadores " · " sueltos.
- Concepto nuevo: `[a, b, c].filter(Boolean).join(' · ')` es una forma corta de unir solo lo que existe. `filter(Boolean)` deja fuera `false`, `''`, `null` y `undefined`; por ejemplo, `[false, 'Marc', '25 Oct'].filter(Boolean)` da `['Marc', '25 Oct']`.
- Cómo probarlo:
  1. `npm run dev`, guarda 3 presupuestos (uno con cliente, uno sin cliente y otro con "Order quantity" 10).
  2. History en modo móvil a 390 y 360 px: cada fila cabe entera, con el importe a la derecha y "10 pcs · Marc · …" bajo el nombre.
  3. En el ordenador (más de 600 px), la tabla tiene todas sus columnas y la línea de abajo no aparece.

### 2026-10-25, Presupuesto en el móvil: la tabla de piezas cabe entera
- Archivo y sitio: src/index.css, sección del presupuesto (`.quote-doc`), dentro de `@media(max-width:700px)`: dos reglas nuevas para `.quote-lines .report-table`.
- Qué cambió: en un móvil, la tabla de piezas del presupuesto ya no se corta. Antes, la columna "Total" salía como "Tota" y los importes como "7.94 EUF", con una barra horizontal escondida. Ahora el nombre de la pieza puede ocupar dos líneas y los márgenes de cada celda son más pequeños.
- Por qué:
  - Es lo que ve un cliente, y se notaba al abrirlo en un móvil. La tabla va dentro de `.table-scroll` (con `overflow-x: auto`): en vez de romperse, se podía desplazar en horizontal, pero nadie lo descubre.
  - La tabla hereda `white-space: nowrap` de `.report-table`, que el informe necesita para sus columnas. Solo en el presupuesto, y solo en la primera columna (el nombre), se vuelve a permitir el salto de línea, con `overflow-wrap: anywhere` para que una palabra muy larga también pueda partirse. Los importes siguen en una línea: un "12.38" partido en dos sería peor.
  - Relleno de 6 px × 4 px en vez de 6 px × 8 px: con 4 columnas son 32 px recuperados, justo lo que faltaba a 360 px.
  - Solo en pantallas de 700 px o menos: el PDF se imprime con el ancho de un A4 (unos 794 px CSS), así que no cambia.
- Cómo probarlo:
  1. `npm run dev` con el navegador en modo móvil a 390 px y a 360 px.
  2. Guarda 3 o 4 presupuestos (uno con un nombre largo), ve a History, marca todos y pulsa "Customer quote".
  3. La tabla del presupuesto se ve entera sin desplazarla: "Total" completo, los importes enteros, y el nombre largo en dos o tres líneas.
  4. "Save as PDF" en un ordenador: el PDF se ve igual que antes.

### 2026-10-23, SEO básico: robots, sitemap, canonical, datos estructurados y contenido sin JavaScript
- Archivo y sitio:
  - index.html, dentro de `<head>`: descripción y título nuevos, `<link rel="canonical">`, `og:type`, etiquetas `twitter:*`, un bloque `application/ld+json` y un `<style>` mínimo. Dentro de `<body>`, el `<div id="root">` ya no está vacío: lleva un `<main>` con el `<h1>` y un párrafo.
  - public/robots.txt (nuevo) y public/sitemap.xml (nuevo): Vite copia `public/` tal cual a la raíz de la web.
  - docs/MAPA.md: fila de `public/` y de `index.html`.
- Qué cambió: la web dice a los buscadores quién es y qué páginas tiene, y su HTML ya contiene texto. Cuando React arranca, sustituye ese texto por la aplicación, y no se nota el cambio.
- Por qué:
  - La web es una SPA: antes, el HTML que descargaba Google era un `<div id="root">` vacío, y todo el texto aparecía al ejecutar JavaScript. Google ejecuta JS, pero en una segunda pasada, más lenta y menos fiable, y otros buscadores y los generadores de vista previa a veces no. Poner el `<h1>` y una descripción real dentro de `#root` da a cualquiera que lea el HTML sin ejecutar nada el contenido esencial. React reemplaza todo el contenido de `#root` al montar (`createRoot(...).render`), así que no hay texto duplicado: comprobado, solo queda un `<h1>`.
  - Título (51 caracteres) y descripción (151) dentro de lo que Google suele mostrar entero (unos 60 y 160), con las palabras que la gente busca ("3D print cost calculator", "quote") en lugar de solo la marca.
  - `canonical`: `layercents.com`, `www.layercents.com` y cualquier dirección con parámetros enseñan la misma página. Sin canonical, Google puede tratarlas como páginas distintas que compiten entre sí.
  - `robots.txt` deja pasar a todos y apunta al sitemap. `sitemap.xml` tiene una sola dirección ahora; cada guía futura añade la suya.
  - JSON-LD de tipo `WebApplication` (schema.org): es la forma estándar de decir "esto es una herramienta web gratuita". Solo lleva hechos verdaderos hoy: no hay valoraciones ni reseñas inventadas, que Google penaliza. Descartado `FAQPage`: desde 2023 Google solo enseña esos resultados para webs de salud y de administraciones.
  - El `<style>` mínimo evita un fogonazo blanco antes de que cargue `index.css`, ahora que hay texto visible en el HTML.
  - No hay lógica, `localStorage` ni `backup.js` tocados.
- Concepto nuevo:
  - Renderizado en cliente (CSR) contra HTML con contenido: en una SPA todo lo que ves lo pinta JavaScript; un buscador ve primero el HTML crudo. Lo que se pone dentro de `#root` en `index.html` se ve antes de que cargue el JS, y React lo reemplaza al arrancar.
  - JSON-LD: JSON dentro de `<script type="application/ld+json">` que los buscadores leen como datos, sin que se vea en la página.
- Cómo probarlo:
  1. `npm run build` y `npm run preview`; abre `/robots.txt` y `/sitemap.xml`: se ven los textos.
  2. En las herramientas de desarrollador, desactiva JavaScript y recarga: sale el título y el párrafo. Actívalo: sale la calculadora.
  3. Pega la dirección en la prueba de resultados enriquecidos de Google (search.google.com/test/rich-results) tras desplegar: debe detectar un `WebApplication`.
  4. Search Console: añade la propiedad de dominio, envía `https://layercents.com/sitemap.xml` y en "Inspección de URLs" pide indexar la portada.

### 2026-10-22, Casillas de números sin flechitas pegadas al valor
- Archivo y sitio: src/index.css, en la sección "Formulario" (después de `.field input`, justo antes de `.field input:hover`): reglas para ocultar los botones de subir y bajar, y el relleno horizontal de 9 a 11 px.
- Qué cambió: las casillas numéricas de la calculadora ya no enseñan las flechitas de subir y bajar, y el número queda con más aire a la derecha.
- Por qué:
  - Las flechas (`<input type="number">` las dibuja el navegador al pasar el ratón) se pintan dentro de la casilla y se comían el relleno: el número quedaba pegado a ellas. Se vio en producción, en un Mac.
  - Casi todos los campos llevan decimales (0.15 €/kWh, 3.5 h, 0.8 €), y el paso por defecto de un `type="number"` es 1, así que las flechas dan saltos que nadie quiere. Ocultarlas no quita nada útil.
  - Se mantiene el tipo `number` (en el móvil sale el teclado numérico, y el valor llega como número), y las teclas arriba y abajo siguen subiendo y bajando el valor. Comprobado. Alternativa descartada: dejar las flechas y subir el relleno derecho, que deja un hueco vacío a la derecha cuando no se ven.
  - Dos reglas porque cada motor usa la suya: `::-webkit-*-spin-button` (Chrome, Safari y Edge) y `-moz-appearance: textfield` (Firefox). `appearance: textfield` es la forma estándar.
  - Solo afecta a `.field input`, o sea la calculadora. No toca lógica, `localStorage` ni `backup.js`.
- Concepto nuevo: pseudo-elementos de proveedor. `input::-webkit-inner-spin-button` apunta a una pieza interna que el navegador pinta dentro de la casilla; no es un elemento del HTML, y por eso solo se puede cambiar con CSS, y con el prefijo del motor.
- Cómo probarlo:
  1. `npm run dev`, abre la calculadora y pasa el ratón por encima de "Part weight": no aparecen flechas.
  2. Haz clic en la casilla y pulsa la flecha arriba del teclado: el valor sube de 1 en 1.
  3. Escribe 0.15 en "Price per kWh": se acepta con decimales.
  4. Comprueba que el número no queda pegado al borde derecho de la casilla.

### 2026-10-22, Barra de precio fija en el móvil: el precio primero
- Archivo y sitio:
  - src/App.jsx, al final del render de la calculadora: el bloque `mobile-total` (la barra fija de abajo). Cambia el orden y los textos.
  - src/index.css, sección "Barra fija abajo en el movil": el precio, más grande y en oro.
- Qué cambió: en el móvil, la barra de abajo empieza por "Recommended price" (grande y en oro), después "Cost", y el botón pasa de "Breakdown" a "See details". Los demás comportamientos de la barra no cambian.
- Por qué:
  - Va con el PR del precio protagonista: en el móvil el resultado sigue estando debajo de todos los campos, y la barra es lo único que enseña la respuesta mientras escribes. Que coincida con la jerarquía de escritorio (precio primero, coste segundo) evita que la persona lea una cosa en el móvil y otra en el ordenador.
  - "See details" en lugar de "Breakdown": el panel al que lleva ya no empieza por el desglose sino por el precio con su explicación, y "Breakdown" ya no es el título de ninguna sección.
  - La barra sigue escondiéndose cuando el panel del resultado entra en pantalla (`IntersectionObserver` sobre `.result`), para no enseñar el precio dos veces. No hizo falta tocar esa lógica: `.result` sigue siendo la columna entera.
  - Alternativa descartada: una tercera cifra (beneficio) en la barra. En 360 px no cabe sin partir líneas, y la barra se come la pantalla.
  - Sin cambios en lógica, `localStorage` ni `backup.js`.
- Concepto nuevo: `position: fixed` con `env(safe-area-inset-bottom)`: la barra se pega al borde de la ventana y el padding inferior respeta la franja de gestos de iPhone y Android, para que el botón no quede bajo ella (ya estaba así; solo se cambia el contenido).
- Cómo probarlo:
  1. `npm run build` y `npm run dev`; abre la web con el modo móvil del navegador a 390 px (y a 360 px).
  2. Arriba de todo, la barra de abajo enseña "Recommended price 7.94 EUR" en grande, "Cost 5.22 EUR" y "See details".
  3. Pulsa "See details": baja hasta el precio y la barra se esconde.
  4. Baja hasta el final: el pie de página no queda tapado y no hay desplazamiento horizontal.
  5. A 360 px los tres elementos de la barra caben en una línea.

### 2026-10-22, "Your setup": lo que se escribe una vez se queda guardado
- Archivo y sitio:
  - src/backup.js: `KEYS.setup`, `sanitizeSetup`, `readSetup`, `saveSetupField`, `clearSetup`; `setup` en `buildBackup`, `parseBackup`, `planRestore` (con `mergeSetup`), `readSettings`, `hasStoredSettings`, `applyRestore` y `downloadBackup`.
  - src/backup.test.js (nuevo): 16 tests.
  - src/BackupPanel.jsx: una línea más en el resumen de la restauración ("Your setup") y el texto "saved settings".
  - src/App.jsx: `SECTIONS` reagrupado (Material, This print, This sale y las dos de "Your setup" con `setup: true`), `SETUP_FIELDS`, `pickSetup`, el estado `d` con inicializador perezoso, `hasSavedSetup`, `setupOpen`, `set` ahora guarda, `resetSetup`, `renderField`, `restoreBackup` actualiza `d`, y el bloque de formulario del render.
  - src/index.css: `.setup-*`; se quita `.toolbar`.
  - docs/MAPA.md y CLAUDE.md: clave nueva, flujo y estado.
- Qué cambió: los números que se escriben una sola vez (precio, vida y consumo de la impresora, luz, fallos, tu tarifa por hora, comisión y margen) están en un bloque "Your setup" que el navegador recuerda campo a campo. Una vez guardado, el bloque aparece plegado con un resumen y botón "Edit"; "Reset to defaults" lo borra. Va también en la copia de seguridad. El botón "Show cost only" desaparece: plegar el bloque hace lo mismo con más sentido.
- Por qué:
  - Qué es "setup" lo decide `SECTIONS` (`setup: true`) y `backup.js` solo valida que sean números no negativos (`sanitizeSetup`): así no hay una segunda lista de nombres que se desincronice del formulario. `App` descarta los nombres que no conoce (`pickSetup`).
  - Se guarda desde el manejador `set`, no desde un `useEffect` sobre `d`: "Load" de un presupuesto viejo y la importación de un laminador llaman a `setD` directamente, así que nunca pisan lo guardado con números antiguos. Con un efecto sobre `d`, cargar un presupuesto de hace un mes sobrescribiría tu configuración actual.
  - Se guarda solo el campo editado, fusionado con lo que ya había (`{ ...guardado, [key]: value }`): un campo que nunca se tocó sigue los valores por defecto de la app, y si algún día cambia un valor por defecto, no se queda fijado un número que la persona nunca escribió.
  - `Field` entrega `0` cuando se vacía el campo (ya era así), por lo que siempre llega un número finito; `saveSetupField` igualmente rechaza negativos y no finitos.
  - Copia de seguridad: `data.setup` es un campo opcional nuevo y por eso `BACKUP_SCHEMA_VERSION` sigue en 1 (el propio backup.js dice que añadir una clave opcional no la sube, porque `parseBackup` ignora lo que no conoce). Un test fija el caso de un archivo v1 de la versión anterior: se restaura con `setup` a `null`.
  - Merge y Replace: Merge rellena, nunca pisa (como `mergeBusiness`). Replace usa el `setup` del archivo, pero si el archivo no tiene (uno anterior a esta función) conserva el de aquí: Replace significa "que este navegador quede como el archivo", y un archivo que no habla de la configuración no debe borrarla.
  - `applyRestore` devuelve `setup` y `restoreBackup` lo vuelca en `d`: el formulario guarda sus números en estado, así que sin eso la restauración solo se vería al recargar.
  - `readSetup`, `saveSetupField` y `clearSetup` buscan `localStorage` dentro de su `try`: con almacenamiento bloqueado, solo leer `window.localStorage` ya lanza una excepción, y como valor por defecto de un parámetro se evaluaría fuera de cualquier `try`. Si falla, la calculadora funciona igual y el número simplemente no se recuerda.
  - Se quita "Show cost only" (escondía las secciones Labor y Selling, aunque seguían contando en el precio). Reorganizar el formulario por "esta pieza" y "tu configuración", con la segunda plegable, resuelve lo mismo sin un botón que nadie entiende. Es un cambio de producto: se puede recuperar si prefieres tenerlo.
  - Alternativa descartada: guardar todo el formulario entre visitas. Los datos de una pieza (gramos, horas) son de esa pieza, y recordar los del último trabajo es más molesto que útil.
- Concepto nuevo:
  - Inicializador perezoso de `useState`: `useState(() => ({ ...INITIAL, ...pickSetup(readSetup()) }))` ejecuta la función una sola vez, en el primer render, en lugar de leer `localStorage` en cada render.
  - Parámetro por defecto que lanza: `function f(x = algo())` evalúa `algo()` en la llamada, antes de entrar en el cuerpo; un `try` dentro de la función no lo cubre. Por eso `storage ?? browserStorage()` va dentro del `try`.
  - `Array.prototype.some`: `[a, b, c].some(key => storage.getItem(key) !== null)` es `true` en cuanto uno cumple, y deja de mirar.
- Cómo probarlo:
  1. `npm test` (44 tests, 16 nuevos) y `npm run build`.
  2. `npm run dev`. Primera visita: "Your setup" aparece abierto. Cambia "Power draw" a 300 y "Hourly rate" a 30: cambia el precio.
  3. Recarga: el bloque sale plegado con "Power draw 300 W" y el precio es el mismo. En DevTools, Application > Local Storage, la clave `setup` vale `{"watts":300,"hourlyRate":30}`: solo lo editado.
  4. Guarda un presupuesto, cambia "Power draw" a 50, ve a History y pulsa "Load": el formulario muestra los números del presupuesto (300) pero `setup` sigue en 50.
  5. History > "Download backup": el JSON lleva `data.setup` y `schemaVersion` sigue siendo 1.
  6. En una ventana de incógnito: History > Restore from file con ese archivo > Merge. En Calculator, "Edit" enseña los números del archivo sin recargar.
  7. Restaura un archivo antiguo (de antes de este PR) con Replace: tu "Your setup" no se borra.
  8. "Reset to defaults": vuelve 110 W y el precio original; la clave `setup` desaparece.

### 2026-10-22, El precio recomendado pasa a ser lo primero que se ve
- Archivo y sitio:
  - src/App.jsx, dentro de `calculate`: nuevo campo `recommendedProfit` en lo que devuelve (la fórmula del coste y del precio no cambia).
  - src/App.jsx, dentro de la función App: `moneyParts` junto a `formatMoney` (que ahora se apoya en ella), y `price` justo después de `const r = calculate(d)`.
  - src/App.jsx, bloque `{/* --- Result --- */}`: ahora son cuatro paneles (precio grande, "Cost to make it" con el símbolo, veredicto con el beneficio por hora, y "Save this quote"). El formulario de guardar, que estaba arriba del todo, se mueve al final de esa columna.
  - src/index.css, sección "Resultado": `.hero*`, `.panel > h2.with-value`, y `.result` deja de ser `sticky` en pantallas de menos de 880 px de alto.
  - docs/MAPA.md: dónde tocar el resultado.
- Qué cambió: el precio recomendado es ahora un número grande en oro, con "You keep X per part after fees" debajo. Después viene el coste con su gráfica, luego qué pasa a tu precio actual (con el beneficio por hora) y al final el formulario de guardar.
- Por qué:
  - El precio es la respuesta que busca la persona; antes el protagonista era el coste, y el precio era una fila más.
  - "Profit per printer hour" estaba pegado al precio recomendado, pero se calcula con tu precio ACTUAL (`profit / hours`). Parecía el beneficio del precio de arriba y no lo era. Pasa al panel del veredicto, que habla del precio actual.
  - `recommendedProfit = recommendedPrice × (1 − f) − cost`, con la misma `f` (comisión ya acotada) que usa el precio: así "You keep" es coherente con la fórmula del precio, y por álgebra sale igual a `cost × margen`. Alternativa descartada: calcularlo en el JSX, que duplicaría la comisión y su acotado (`Math.min`/`Math.max`) en dos sitios.
  - `moneyParts` devuelve entero, céntimos y moneda por separado para poder pintar los céntimos más pequeños. `formatMoney` se construye encima, así que sigue habiendo un único sitio que decide cómo se escribe el dinero y el resto de la web no cambia (se sigue viendo `7.94 EUR`). Alternativa descartada por ahora: pasar a `Intl.NumberFormat` con el símbolo (`7,94 €`); cambiaría el texto de History, informe y presupuestos y es un cambio aparte.
  - Guardar va después del resultado: guardas lo que acabas de ver. En escritorio la columna es `sticky`, pero con todo lo anterior mide unos 820 px; en una pantalla baja (menos de 880 px) se quedaría pegada tapando el botón de guardar, así que ahí se desplaza con la página.
  - No se toca localStorage ni backup.js: el presupuesto guardado es exactamente el mismo (nombre, cliente, entradas, partes, coste, precio).
- Concepto nuevo:
  - `String.prototype.split` con desestructuración: `const [whole, cents] = '7.94'.split('.')` da `whole = '7'` y `cents = '94'` en una línea.
  - `@media (max-height: …)`: igual que `max-width`, pero mira el alto de la ventana; sirve para decidir el diseño según cuánto cabe en vertical.
- Cómo probarlo:
  1. `npm test` y `npm run build`.
  2. `npm run dev`. En Calculator, arriba a la derecha: "Recommended price" 7.94 EUR en grande y "You keep 2.09 EUR per part after fees".
  3. Cambia "Target margin" a 60: el precio sube y "You keep" sube; si lo pones a 0, "You keep" es 0.00 EUR.
  4. Pon "Order quantity" a 10: debajo del precio sale "Order total (10 pcs)".
  5. Escribe un nombre y pulsa "Save quote" (ahora está al final de la columna de la derecha): sale "Saved … · View history" y el presupuesto aparece en History igual que antes.
  6. Con la ventana de menos de 880 px de alto, la columna ya no se queda pegada: baja con la página y se llega al botón.
  7. En 390 px de ancho: el precio no se corta y el resto de la pantalla sigue igual.

### 2026-10-22, La gráfica de costes pasa a ser el símbolo de layercents
- Archivo y sitio:
  - src/logoGeometry.js (nuevo): las coordenadas de las capas del logo (`FULL`, `SMALL`) y su altura. Antes estaban dentro de Logo.jsx.
  - src/symbolChart.js (nuevo): `printOrder` y `symbolPieces`, funciones puras que reparten los costes sobre las capas.
  - src/symbolChart.test.js (nuevo): 11 tests.
  - src/CostSymbol.jsx (nuevo): el componente SVG.
  - src/Logo.jsx: ahora importa la geometría de logoGeometry.js (mismo dibujo).
  - src/App.jsx: import de `CostSymbol`; en `LAYERS` los dos grises se aclaran; en el panel "Breakdown", `<CostSymbol>` sustituye al pilar vertical `.stack`.
  - src/index.css, sección "Resultado": se quitan `.stack` y `.layer`; entran `.cost-symbol`, `.cost-symbol-empty` y `.cost-symbol-piece`; el importe de la leyenda no parte línea.
  - docs/MAPA.md: archivos nuevos y dónde tocar.
- Qué cambió: la gráfica de "Breakdown" ya no es una barra vertical, sino el símbolo ¢ "impreso" con los costes: el material llena las capas de abajo y el embalaje las de arriba, cada coste con su color. Al cambiar un número, las fronteras entre colores se deslizan.
- Por qué:
  - Reparto por longitud: las 11 capas miden lo mismo de alto, así que su largo total (215,08 unidades) es proporcional a su superficie. A cada coste le toca `(coste / total) × 215,08`, y se recorre capa a capa, la de abajo primero y de izquierda a derecha. Es el mismo reparto que una barra apilada, pero desenrollado sobre el símbolo.
  - Función pura aparte (`symbolChart.js`) y componente que solo pinta: es la única parte que puede mentir (si falla una cuenta, la gráfica enseña un reparto falso sin que nada se rompa). Por eso tiene tests: proporciones, que llene el símbolo sin dejar una línea vacía al final, el orden, el hueco entre colores y entradas raras (NaN de un campo vacío, negativos, todo a 0).
  - Una capa compartida por dos costes: se dibuja la barra redondeada como `clipPath` y encima rectángulos de color. Así los extremos siguen redondos y el corte entre colores es recto. Alternativa descartada: calcular el contorno de cada trozo (arco más recta), mucho más código para el mismo resultado.
  - Siempre 6 rectángulos por capa, aunque midan 0: React mueve el mismo elemento en lugar de crear y destruir elementos, y eso es lo que permite que CSS anime `x` y `width` (sin elemento estable no hay transición). Con `prefers-reduced-motion` no se anima.
  - Hueco de 0,6 entre dos colores de una misma capa, quitado a los trozos (no pintado con el color del panel): no depende del fondo. Los extremos de la capa no se recortan.
  - `logoGeometry.js` aparte: el logo y la gráfica necesitan las mismas coordenadas, y con dos copias, cambiar el logo rompería la gráfica sin avisar.
  - `useId` para los `clipPath`: si hay dos símbolos en la misma página, un `id` repetido haría que `url(#id)` cogiera el recorte equivocado.
  - Accesibilidad: el SVG lleva `role="img"` y un `aria-label` con los importes, y la leyenda con las cifras exactas sigue visible. Los colores solos no dicen nada a quien no los ve.
  - Los grises de mano de obra y embalaje se aclaran (`#7E7E8C`→`#A3A3B1`, `#4E4E58`→`#6C6C7A`): el embalaje es la capa de arriba y con el gris oscuro se perdía sobre el panel, y el símbolo perdía la forma.
  - Límite que hay que conocer: un coste muy pequeño (la luz, un 1 %) se queda en una rayita. Por eso la leyenda lleva el importe exacto: el símbolo dice qué domina; la leyenda, cuánto.
  - No se toca `calculate()` ni se guarda nada nuevo: no hay claves de localStorage ni cambios en backup.js.
- Concepto nuevo:
  - `clipPath` (SVG): recorta lo que se dibuja dentro de él a una forma. `<clipPath id="a"><rect .../></clipPath>` y luego `<g clip-path="url(#a)">` pinta solo lo que cae dentro del rectángulo.
  - Transición CSS sobre atributos SVG: en un `<rect>`, `x` y `width` son propiedades CSS en los navegadores modernos, así que `transition: x .35s, width .35s` las anima. Si un navegador no lo soporta, simplemente salta, sin romperse.
  - Ordenar una copia: `[...layers].sort(...)` ordena sin cambiar el array original (`sort` modifica el array sobre el que se llama).
- Cómo probarlo:
  1. `npm test` (28 tests, 11 nuevos) y `npm run build`.
  2. `npm run dev`. En Calculator, el panel "Breakdown" muestra el símbolo: abajo oro (material) y arriba gris (embalaje).
  3. Cambia "Print time" a 30: la depreciación (azul) crece y las fronteras se deslizan. Pon "Part weight" a 0: el oro casi desaparece.
  4. Vacía algún campo: no debe salir ningún error ni un trozo raro.
  5. En el móvil (o con el navegador a 390 px), la leyenda no parte "0.80 EUR" en dos líneas.
  6. Con "reducir movimiento" activado en el sistema, las fronteras saltan sin deslizar.

### 2026-10-22, Agente local, paso 2: la web detecta el agente (pestaña Printers, opt-in)
- Archivo y sitio:
  - src/agent.js (nuevo): `checkAgent`, `isAgentEnabled`, `setAgentEnabled` y `consumeAgentOptIn`, más las constantes `AGENT_URL` y `AGENT_PROTOCOL`.
  - src/agent.test.js (nuevo): 8 tests, entre ellos los de contrato contra el código real de agent/handler.js.
  - src/Printers.jsx (nuevo): la pantalla, con cinco estados (comprobando, conectado, desactualizado, otro programa en el puerto y apagado), "Check again" y "Hide this tab".
  - src/main.jsx: lee y quita `?agent` antes de arrancar React y pasa `agentOptIn` a App.
  - src/App.jsx: imports; la prop `agentOptIn`; `view` puede empezar en `'printers'`; estado `agentOn` y `turnOffAgent` junto a `view`; la pestaña Printers; History se marca activa solo en sus pantallas (`history`, `report`, `quote`); la rama `view === 'printers'` del render.
  - src/backup.js: `KEYS.agentEnabled`, por dispositivo y fuera de las copias.
  - src/index.css, al final: sección "Impresoras (beta)".
  - docs/MAPA.md y CLAUDE.md: archivos, clave nueva, flujo y estado.
- Qué cambió: `layercents.com/?agent` activa en ese navegador una pestaña Printers que dice si el agente está corriendo, con su versión y desde cuándo. Si no lo está, explica cómo arrancarlo. Para quien no la activa, la web es exactamente igual que antes.
- Por qué:
  - Opt-in y no detección automática: desde una web pública, una petición a 127.0.0.1 hace que Chrome pida permiso para acceder a apps y servicios del dispositivo (Local Network Access, la evolución de Private Network Access). Sondear en cada visita le enseñaría ese aviso a todo el mundo, y casi nadie tiene el agente. Además el agente aún no se puede instalar sin Node, así que la pestaña no se anuncia: se llega por enlace.
  - `?agent` se lee en main.jsx y no en un inicializador de `useState`: cambia la URL y el almacenamiento, y StrictMode llama dos veces a los inicializadores en desarrollo; la segunda llamada ya no vería el parámetro. Después se borra con `history.replaceState`, para que un enlace copiado de la página no active la pestaña a quien lo reciba.
  - `checkAgent` nunca lanza y separa cuatro casos. `offline` agrupa puerto cerrado, timeout, CORS rechazado y permiso denegado, porque desde el código de la página todos son el mismo `TypeError` de `fetch`. `wrong` comprueba el nombre `layercents-agent` para no confundir el agente con otro programa en el 31415. `outdated` compara `protocol`.
  - Timeout de 2 s con `AbortSignal.timeout`: un servidor local responde en milisegundos, pero si un firewall descarta el paquete en vez de rechazarlo, el navegador esperaría alrededor de un minuto.
  - En Printers, comprobación al abrir y con un botón, no con temporizador: sondear sin que nadie mire es tráfico inútil a 127.0.0.1. Un contador en `useRef` hace que gane la última comprobación si dos se solapan (doble clic, o el doble efecto de StrictMode en desarrollo).
  - El `setState` de "comprobando" está en el manejador del botón y no dentro del efecto: oxlint (`set-state-in-effect`) avisa porque un `setState` síncrono dentro de un efecto provoca un render extra. Al abrir, el estado ya empieza en `checking`.
  - Tests de contrato: `checkAgent` se prueba contra el handler real del agente en un puerto aleatorio, y hay un test que exige que `AGENT_PROTOCOL` y `PROTOCOL` coincidan. Si un lado cambia el contrato sin el otro, `npm test` falla antes de llegar al navegador.
- Concepto nuevo:
  - `history.replaceState(state, '', url)`: cambia la dirección de la barra sin recargar ni añadir un paso al botón Atrás.
  - `AbortSignal.timeout(ms)`: una señal que cancela el `fetch` sola al pasar ese tiempo, sin tener que crear un `AbortController` a mano.
  - `useCallback(fn, [])`: devuelve la misma función en cada render, así un efecto que depende de ella no se repite en cada render.
- Cómo se probó: los 17 tests de `npm test` (9 del agente y 8 de la web) y un recorrido en Chromium sobre el build de producción con el agente real. Comprobado: una visita normal no hace ninguna petición al agente; `?agent` abre Printers, borra el parámetro y sale "Agent connected"; al recargar la pestaña sigue; con el agente parado salen los pasos y "Check again" vuelve a conectar al arrancarlo; "Hide this tab" la quita, borra la clave y no hay más peticiones; en un móvil de 390 px caben las tres pestañas. También se repitió el recorrido de la copia de seguridad, sin cambios. Falta probar en Safari y en la web publicada, que es https: Chrome puede pedir el permiso.
- Cómo probarlo:
  1. Terminal 1: `npm run agent`. Terminal 2: `npm run dev`.
  2. Abre `http://localhost:5173/?agent`: sale Printers con "Agent connected" y la dirección queda sin `?agent`.
  3. Para el agente con Ctrl+C y pulsa "Check again": salen los pasos para arrancarlo.
  4. "Hide this tab": la pestaña desaparece y, en las herramientas del navegador (pestaña Network), no hay más peticiones a 127.0.0.1.

### 2026-10-22, Agente local, paso 1: servidor HTTP en 127.0.0.1
- Archivo y sitio:
  - agent/handler.js (nuevo): `createHandler`, que decide la respuesta a cada petición, y las constantes `PROTOCOL`, `VERSION` y `ALLOWED_ORIGINS`.
  - agent/server.js (nuevo): arranque, puerto, mensaje si el puerto está ocupado y parada limpia con Ctrl+C.
  - agent/handler.test.js (nuevo): 9 tests con `node:test`.
  - package.json: scripts `agent` (`node agent/server.js`) y `test` (`node --test`).
  - docs/MAPA.md: el agente en la tabla de archivos, una sección propia y los comandos nuevos.
  - CLAUDE.md: la excepción del agente a la regla "sin backend", el estado y el plan de la conexión con impresoras paso a paso.
- Qué cambió: `npm run agent` arranca un servidor HTTP en `http://127.0.0.1:31415` que, por ahora, solo responde a `/health` con nombre, versión, protocolo, hora de arranque y una lista de impresoras vacía.
- Por qué:
  - Las impresoras hablan MQTT sobre TLS y FTPS. El navegador solo habla MQTT por WebSocket y no puede llamar desde una página `https` a una dirección `http` de la red local (mixed content y restricciones de red privada). Hace falta un proceso local que haga de puente. Es el patrón edge → central: el agente cerca de las máquinas y la web consumiendo sus datos.
  - Node y no Python: un solo lenguaje en todo el proyecto, y en el paso 5 el agente reutilizará `parseSliceInfo` de src/slicerFile.js en vez de reescribir el parser del 3MF. Sin dependencias en este paso: `node:http`, `node:test` y `node:assert` vienen con Node.
  - Sin package.json propio en agent/: la raíz ya declara `"type": "module"` y comparte `node_modules`. Descartado por ahora un paquete separado; tendrá sentido cuando haya que empaquetar el agente para gente sin Node instalado.
  - `127.0.0.1` y no `0.0.0.0`: con todas las interfaces, cualquiera en la misma Wi-Fi podría leerlo, y más adelante guardará los códigos de acceso de las impresoras.
  - Comprobación del `Host`: defensa contra DNS rebinding. Una web maliciosa puede hacer que su dominio resuelva a 127.0.0.1; entonces el navegador considera el agente parte de ese mismo origen y CORS ya no protege. Esas peticiones siguen llevando el dominio del atacante en `Host`, y por eso se rechazan con 403.
  - `Origin` desconocido rechazado en el servidor, no solo con CORS: CORS impide que la página lea la respuesta, pero la petición se ejecuta igual. Hoy da igual porque `/health` solo lee; los endpoints futuros harán más.
  - Preflight con `Access-Control-Allow-Private-Network: true`: es lo que pide la Private Network Access de Chrome cuando una página pública llama a una dirección local. Solo se envía si el navegador lo pregunta.
  - `PROTOCOL` en `/health`: la web se actualiza en cada despliegue, pero el agente de cada persona no. Con ese número, la web podrá decir "actualiza el agente" en vez de fallar sin explicación.
  - Puerto fijo 31415: la web necesita saber dónde buscar. Está por debajo de 32768, fuera de los rangos de puertos efímeros de Linux, macOS y Windows, así que ninguna conexión saliente lo ocupará por casualidad.
  - `handler.js` no abre puertos, solo responde: así los tests usan el mismo código en un puerto aleatorio (el 0 le pide uno libre al sistema) sin chocar con un agente real.
- Concepto nuevo:
  - CORS: el navegador deja que una página lea la respuesta de otro origen solo si esa respuesta trae `Access-Control-Allow-Origin` con su origen. Lo aplica el navegador, no el servidor: curl lo ignora.
  - Preflight: antes de ciertas peticiones entre orígenes, el navegador envía un `OPTIONS` preguntando si puede hacerla, y solo sigue si la respuesta lo permite.
  - `node:test`: el test runner que trae Node. `npm test` ejecuta `node --test`, que busca los archivos `*.test.js` del proyecto.
- Cómo probarlo:
  1. `npm run agent`: sale "layercents agent 0.1.0 listening on http://127.0.0.1:31415".
  2. Abre `http://127.0.0.1:31415/health` en el navegador: sale el JSON.
  3. En otra terminal, `curl -i -H "Origin: https://evil.example" http://127.0.0.1:31415/health` devuelve 403.
  4. Con el agente en marcha, `npm run agent` en otra terminal dice que el puerto ya está en uso.
  5. `npm test`: 9 tests en verde.

### 2026-10-22, Mapa del código (docs/MAPA.md)
- Archivo y sitio: docs/MAPA.md (nuevo). En CLAUDE.md, la regla de mantenerlo al día y una línea en el estado.
- Qué cambió: un documento para orientarse antes de leer el código: arquitectura, orden de lectura, qué hace cada archivo, diagrama del flujo de datos, monedas, claves de localStorage con quién las lee y las escribe, la forma de un presupuesto guardado, las fórmulas de `calculate`, los patrones que se repiten y dónde tocar para cada cambio.
- Por qué: con unas 2.900 líneas que Julen no ha escrito, leer archivo por archivo sin un mapa obliga a reconstruir la arquitectura en la cabeza cada vez. El DEV_LOG cuenta la historia en orden cronológico; el mapa cuenta cómo está hecho ahora. Va dentro del repo, y no en notas aparte, para que cambie junto con el código: CLAUDE.md obliga a actualizarlo. No se usan números de línea porque cambian en cada PR: se citan funciones y secciones.
- Dos cosas encontradas al hacerlo, que no se tocan en este PR:
  - `failures` usa `base × p`, cuando el coste esperado con una tasa de fallos `p` es `base / (1 − p)`. Con el 8 % casi no cambia; con el 30 % sí. Está explicado en el mapa.
  - `src/assets/` y `public/icons.svg` son restos de la plantilla de Vite que nada usa.
- Cómo probarlo: abre docs/MAPA.md en GitHub (pinta las tablas y el diagrama) y sigue el "Orden recomendado de lectura". La app no cambia: `npm run build` funciona igual.

### 2026-10-22, CLAUDE.md: explicaciones a nivel de ingeniero y trabajo por pull request
- Archivo y sitio: CLAUDE.md, en "Sobre el dueño", en el formato de este registro ("Por qué") y en "Reglas de trabajo".
- Qué cambió: las explicaciones pasan a nivel de ingeniero (término técnico y porqué de cada decisión) y el flujo de trabajo queda por escrito: rama `feature/...` y pull request contra `main`. Push a `main` y `npm run deploy` siguen siendo solo de Julen.
- Por qué: Julen lo quiere así, y el archivo seguía diciendo "lenguaje de principiante" y "no hagas git push". Cada sesión nueva de Claude Code empieza leyendo CLAUDE.md, así que habría vuelto al estilo anterior. Va en un commit aparte para poder revertirlo sin tocar la copia de seguridad.
- Cómo probarlo: no cambia la app; `npm run build` sigue funcionando.

### 2026-10-22, Copia de seguridad: descargar y restaurar todo en un JSON versionado
- Archivo y sitio:
  - src/backup.js (nuevo): toda la lógica. Arriba, funciones puras sin DOM ni localStorage (`buildBackup`, `parseBackup`, `sanitizeQuote`, `sanitizeBusiness`, `mergeQuotes`, `planRestore`, `backupStatus`); abajo, la capa de almacenamiento (`readSettings`, `readLastBackup`, `writeAtomically`, `applyRestore`, `downloadBackup`, `readBackupFile`), que recibe `storage` como parámetro.
  - src/BackupPanel.jsx (nuevo): `BackupPanel` (panel al final de History: descargar, restaurar y caja de confirmación) y `BackupReminder` (aviso encima de History).
  - src/App.jsx: imports; dentro de App, justo después de `deleteQuote`, el estado `lastBackupAt`, las funciones `backupNow` y `restoreBackup` y `backupDue`; el punto en la pestaña History; en la vista `history`, `<BackupReminder>` encima de `<History>` y `<BackupPanel>` debajo. En `saveQuote`, un comentario que remite a `sanitizeQuote`.
  - src/index.css, al final: sección "Copia de seguridad".
  - README.md: la función en "What it does"; "Private by design" ya no recomienda exportar a Excel para no perder datos.
  - CLAUDE.md: estado, regla sobre claves de localStorage e ideas futuras.
- Qué cambió: History tiene un panel "Backup". "Download backup" baja un `.json` con los presupuestos, los datos del negocio (logo incluido) y el contador de presupuestos. "Restore from file" valida el archivo y enseña un resumen antes de escribir nada; si el navegador ya tiene datos, se elige Merge o Replace. Cuando toca hacer copia sale un aviso encima de History y un punto en la pestaña.
- Por qué:
  - Lo pidió un usuario en Reddit, y con razón: localStorage está ligado al origen y al navegador, así que limpiar los datos del sitio o cambiar de equipo lo borra todo. El Excel es un informe y no sirve para restaurar: reimportarlo pierde tipos, depende del formato regional de los números y no lleva el negocio ni el contador. Sin una copia restaurable, nadie confía la app a su trabajo con clientes.
  - JSON porque es la misma serialización que ya hay en localStorage: el round-trip es exacto (en los tests, lo restaurado es idéntico a lo guardado).
  - Esquema versionado (`app`, `kind`, `schemaVersion`) con una tabla de migraciones, vacía por ahora: cualquier archivo descargado hoy se seguirá restaurando cuando cambie el formato. Un archivo de una versión más nueva se rechaza en vez de interpretarse mal. Los cambios aditivos (una clave opcional nueva) no suben la versión, porque el parser ignora lo que no conoce.
  - El archivo es entrada no confiable, así que se valida antes de tocar nada. Campo obligatorio inválido (id entero positivo, `cost` y `price` finitos): la entrada se descarta y se cuenta, y el resumen lo dice antes de restaurar. Campo opcional con tipo incorrecto: se elimina ese campo, no el presupuesto. Campos desconocidos: se conservan, porque la primera obligación de una copia es no perder datos. `inputs` y `parts` solo admiten números finitos (un `"20"` en texto convierte una suma en concatenación). El logo solo se acepta como data URL raster (png, jpeg, webp, gif), así un archivo no puede apuntar a una URL remota que haría una petición a un tercero cada vez que se abre un presupuesto.
  - Merge es una unión por id. Mismo id y mismo contenido (comparando una forma canónica con las claves ordenadas): es el mismo presupuesto y se queda una vez. Mismo id y distinto contenido (dos `Date.now()` iguales en dos equipos): se guardan los dos; el entrante pasa al siguiente id libre, y antes se fija su `createdAt`, porque History usa el id como fecha cuando falta. En los datos del negocio gana lo de este navegador y solo se rellenan los campos vacíos. Replace deja el navegador igual que el archivo y pide confirmación si va a borrar presupuestos que solo están aquí.
  - El contador de presupuestos toma el máximo en los dos modos. Es una secuencia que ven los clientes (2026-007): si bajara, se repetirían números de presupuesto. Invariante: nunca decrece.
  - `writeAtomically`: localStorage no tiene transacciones. Se hace un snapshot de las claves, se escribe y, si una escritura falla (QuotaExceededError, SecurityError), se deshace todo y se informa de si el rollback funcionó. Se escribe primero el almacenamiento y después el estado de React, así la pantalla nunca enseña un restore que no ha ocurrido.
  - Recordatorio: `lastBackupAt` es de cada dispositivo y no va dentro del archivo. Un presupuesto está pendiente si su `createdAt` es posterior a la última copia. El aviso sale si hay algo pendiente y no hay copia o tiene 7 días o más. Después de restaurar, `lastBackupAt` pasa a la fecha del archivo solo si el navegador no tiene nada que no esté en él, y nunca retrocede.
  - El panel va fuera de `<History>` porque History hace un return temprano cuando está vacío, y un History vacío (un equipo nuevo) es justo donde hace falta "Restore from file".
- Concepto nuevo:
  - Blob + `URL.createObjectURL` + `<a download>`: crea y descarga un archivo en el cliente, sin servidor. La URL se revoca al cabo de un minuto, porque revocarla en el mismo tick puede cancelar la descarga en algunos navegadores.
  - `File.text()`: lee de forma asíncrona el archivo elegido. Antes se mira `file.size` (máximo 10 MB) para no bloquear la pestaña si alguien elige un archivo enorme por error.
  - Live region (`role="status"`): el elemento está siempre en la página y solo cambia su texto, porque los lectores de pantalla no anuncian de forma fiable una región que aparece ya con contenido.
  - Gestión del foco: la caja de confirmación tiene `tabIndex={-1}` y un `useEffect` le hace `focus()` al abrirse, así el foco de teclado llega a la pregunta.
- Cómo se probó:
  - 14 tests con `node:test` sobre las funciones puras y la capa de almacenamiento, con un storage falso que tiene cuota: round-trip exacto; rechazo de JSON ajeno, truncado y de versión nueva; entradas dañadas; colisiones de id; contador que no baja; rollback con la cuota llena y con el almacenamiento bloqueado; `lastBackupAt` que no retrocede.
  - Recorrido completo en Chromium headless sobre el build de producción (`vite preview`): aviso y punto con 3 presupuestos sin copia; descarga y contenido del archivo; navegador vacío → restore → historial, negocio y contador recuperados; "Load" sobre un presupuesto restaurado; Merge del mismo archivo (nada nuevo); Replace con diálogo y contador que no baja; archivos erróneos (Excel, JSON ajeno, truncado, versión nueva); entrada dañada anunciada y Cancel sin escribir nada; presupuesto de cliente con el negocio y el número restaurados; aviso de copia de hace más de una semana; móvil de 390 px sin scroll lateral.
  - Los tests se ejecutaron fuera del repositorio para no añadir dependencias (Vitest, Playwright) sin preguntarlo.
- Cómo probarlo:
  1. `npm run dev`, guarda 2 presupuestos y abre History: arriba sale "No backup yet" y la pestaña tiene un punto.
  2. "Download backup": baja `layercents-backup-AAAA-MM-DD-HHMM.json`. El aviso y el punto desaparecen y el panel dice "Up to date".
  3. Abre una ventana de incógnito (tiene su propio localStorage) en `localhost:5173`, History → "Restore from file" → el archivo → "Restore". Salen los presupuestos, y en "Customer quote" están tu negocio y el número siguiente.
  4. En la ventana normal, guarda otro presupuesto y restaura el mismo archivo: "Merge" no duplica nada; "Replace" avisa de que va a borrar 1.
  5. Elige el .xlsx de "Export Excel": dice que es un informe y que no se puede restaurar.

### 2026-10-16, Portada de GitHub: README con capturas y nombre layercents
- Archivo y sitio:
  - README.md: reescrito entero.
  - screenshots/: carpeta nueva con logo.svg (el logo para el README) y tres capturas: calculator.png, quote.png e history.png.
  - package.json y package-lock.json: el campo "name" de arriba del todo pasa de "coste-3d" a "layercents".
- Qué cambió: el README, que es la portada del proyecto en GitHub, ahora tiene el logo, una frase de qué es, capturas de la calculadora, del presupuesto y del historial, la lista de funciones, cómo se protegen los datos, lo que viene, cómo arrancarlo en tu ordenador y que el código no es de uso libre. Si un archivo del laminador no se importa, pide mandarlo en un .zip, porque GitHub no deja adjuntar .gcode ni .3mf sueltos. La web no cambia, así que no hace falta publicarla con `npm run deploy`.
- Por qué: quien pulsa "Tell me on GitHub" en el pie de la web llega a esta portada, y con el post de Reddit llegará más gente. Con capturas y la marca nueva parece un producto serio, no un ejercicio. El nombre del paquete es una etiqueta interna que nadie ve, pero así todo el proyecto dice layercents. El nombre del repositorio y la caja "About" de GitHub solo se pueden cambiar desde los ajustes de GitHub, y eso lo hace Julen.
- Concepto nuevo:
  - Enlace relativo en un README: `[open an issue](../../issues)` no lleva la dirección completa. GitHub lo calcula desde donde está el archivo (`llopjulen/coste-3d/blob/main/README.md`): sube dos niveles y llega a `llopjulen/coste-3d/issues`. Así sigue funcionando aunque el repositorio cambie de nombre.
  - HTML dentro de Markdown: `<p align="center">…</p>` centra el logo y el título. Markdown no sabe centrar, pero GitHub acepta un poco de HTML en los README.
- Cómo probarlo:
  1. Abre https://github.com/llopjulen/coste-3d: arriba salen el logo, el título centrado y la captura de la calculadora.
  2. Baja: están las capturas del presupuesto y del historial.
  3. Pulsa "open an issue": se abre la lista de issues del proyecto.
  4. `npm run build` funciona igual que antes.

### 2026-10-16, Repaso visual: móvil, tres pasos y pie de página
- Archivo y sitio:
  - src/App.jsx: debajo del subtítulo de la calculadora, la lista `steps` con los tres pasos. Antes del pie, la barra `mobile-total`. Dentro de App, `resultRef`, `resultInView` y `showResult`, justo antes de `currency`. La función nueva `SiteFooter`, encima de "4) APP", que se usa en la calculadora y en el historial. En la nota del resultado se quita la frase "Filament is only…". La ayuda de "Platform fee" ahora explica que la comisión se cobra sobre el precio final.
  - src/History.jsx: la función `fmtDay`, junto a `quoteDate`, para las fechas de la tabla y del aviso de borrar.
  - src/index.css: `h1` con la letra del logo; arreglo de la barra de arriba en el móvil (debajo de `.currency`); estilos `.steps`, `.site-foot` y `.mobile-total`.
- Qué cambió:
  - En el móvil la barra de arriba va en dos filas y ya no sale cortada.
  - Abajo hay una barra fija con el coste y el precio recomendado; se esconde al llegar al resultado.
  - Los títulos usan la letra del logo, debajo del título hay tres pasos y al final un pie con la promesa de privacidad y dónde mandar ideas.
  - Las fechas salen como "12 Oct 2026".
- Por qué:
  - En un móvil de 390 px la barra de arriba medía 401 px: el selector de moneda salía cortado y la página se movía de lado. Casi toda la gente que llega desde Reddit entra con el móvil.
  - En el móvil el resultado quedaba tres pantallas más abajo que las casillas, y quien entraba por primera vez no veía el precio.
  - Los tres pasos cuentan en un vistazo qué hace la app distinto: soltar el archivo del laminador.
  - Con el mes en letras nadie confunde el día con el mes (10/12 es octubre en EE. UU. y diciembre en España).
  - Julen pidió quitar la frase del filamento y el texto de abajo. La idea de la comisión pasa a la ayuda (botón i) de su casilla, y la de que nada sale del navegador, al pie.
- Concepto nuevo:
  - `useRef`: una "etiqueta" para un elemento de la página. `const resultRef = useRef(null)` y `<div ref={resultRef}>`; luego `resultRef.current` es ese div, por ejemplo para hacer `resultRef.current.scrollIntoView()`.
  - `IntersectionObserver`: el navegador avisa cuando un elemento entra o sale de la pantalla, sin tener que vigilar el scroll a mano. Ejemplo: `new IntersectionObserver(([e]) => console.log(e.isIntersecting)).observe(el)`.
  - `@media(max-width:520px){…}`: reglas de CSS que solo valen cuando la pantalla mide 520 px de ancho o menos. Así el móvil tiene su propio diseño sin tocar el del ordenador.
- Cómo probarlo:
  1. `npm run dev` y abre la página con el móvil, o en el ordenador con la vista de móvil del navegador (F12 → icono del móvil).
  2. Arriba se ven la marca y EUR en una fila y las pestañas en otra, y la página no se mueve de lado.
  3. Abajo sale la barra con el coste y el precio. Pulsa "Breakdown": baja hasta el resultado y la barra se esconde.
  4. Al final de la página está el pie con el enlace a GitHub.
  5. En History las fechas salen como "12 Oct 2026".

### 2026-10-16, La web pasa a layercents.com
- Archivo y sitio:
  - vite.config.js: `base` pasa de `'/coste-3d/'` a `'/'`.
  - public/CNAME (archivo nuevo): una sola línea, `layercents.com`.
  - index.html: `og:url` y `og:image` con la dirección completa del dominio nuevo.
  - README.md: el enlace "Live".
  - CLAUDE.md: nombre, dirección, estilo (oro en vez de verde) y estado.
- Qué cambió: la app ya no vive en llopjulen.github.io/coste-3d sino en https://layercents.com.
- Por qué:
  - Una dirección propia es más fácil de recordar y de enseñar, y no depende de tu usuario de GitHub.
  - `base` le dice a Vite en qué carpeta va a estar la web. Antes era la carpeta /coste-3d/ dentro de tu web de GitHub; ahora la app está en la raíz del dominio, así que es `/`. Si no se cambia, la página busca sus archivos en layercents.com/coste-3d/ y sale en blanco.
  - El archivo CNAME es cómo GitHub Pages sabe qué dominio servir. Va en public/ para que Vite lo copie tal cual al publicar.
  - WhatsApp, Reddit y compañía solo enseñan la imagen de vista previa si la dirección está completa, con https:// y el dominio.
  - Es el mejor momento para mudarse: la versión que había en la web no guardaba nada en el navegador, así que nadie pierde presupuestos. A partir de ahora sí guardan, y los datos van ligados a la dirección: por eso no conviene volver a cambiarla.
- Concepto nuevo:
  - DNS: la "agenda" de internet, que traduce un nombre (layercents.com) a la dirección de un servidor. Los registros A apuntan el dominio a los servidores de GitHub Pages (por ejemplo `185.199.108.153`), y el CNAME hace que `www.layercents.com` vaya al mismo sitio.
  - Mismo origen: el navegador guarda localStorage por dirección. Lo guardado en https://layercents.com no se ve desde http://layercents.com ni desde otra dirección; son "cajones" distintos.
- Cómo probarlo:
  1. Abre https://layercents.com: sale la app con el logo nuevo y el candado. El certificado lo pone Cloudflare, porque los registros tienen el proxy activado (nube naranja).
  2. Abre la dirección vieja, llopjulen.github.io/coste-3d: te lleva a layercents.com.
  3. Escribe http://layercents.com (sin la s): debe pasar solo a https://. Si no, activa "Always Use HTTPS" en Cloudflare (SSL/TLS → Edge Certificates).
  4. Pega el enlace en un chat de WhatsApp: debe salir la imagen con el logo.

### 2026-10-16, Nueva marca: layercents, logo y color oro
- Archivo y sitio:
  - src/Logo.jsx (archivo nuevo): el símbolo, un ¢ hecho de capas impresas, dibujado en SVG.
  - src/App.jsx: en la barra de arriba, el punto verde y "Print Cost" pasan a ser el logo y "layercents". En la lista `LAYERS`, el material pasa de verde a oro.
  - src/Report.jsx: cabecera del informe, título de la pestaña ("layercents report AAAA-MM-DD") y pie.
  - src/CustomerQuote.jsx: el pie de la hoja dice "Quote made with layercents · layercents.com".
  - src/exportExcel.js: título del Excel y color de los importes destacados (`ACCENT`).
  - src/index.css, arriba del todo: los colores. `--verde` y `--verde-vivo` pasan a ser `--oro` y `--oro-vivo`, y hay dos nuevos: `--sobre-oro` (texto encima de un botón de oro) y `--oro-papel` (un oro más oscuro para el informe). Estilos nuevos `.brand`, `.logo-layers` y `.logo-stroke`.
  - index.html: título de la pestaña, descripción, tipo de letra Bricolage Grotesque (solo para el nombre) e iconos.
  - public/: favicon.svg, favicon-32.png, apple-touch-icon.png, icon-512.png y social-preview.png (la imagen que sale al compartir el enlace por WhatsApp o Reddit), todos nuevos con el logo.
  - README.md: el nombre y el lema.
- Qué cambió: la app se llama layercents, tiene logo propio y su color es el oro en vez del verde.
- Por qué:
  - "Print Cost" describe la app pero no se puede proteger como marca, y el verde era el de Bambu Lab: con nombre y color propios no parece un producto suyo.
  - Sobre un botón de oro el texto blanco casi no se lee, así que esos botones llevan texto oscuro (`--sobre-oro`).
  - En papel blanco el oro normal se ve flojo; el informe usa `--oro-papel`, más oscuro, para las barras y el logo.
  - El logo tiene dos versiones: la de siete capas para tamaños grandes y la de cuatro (`small`) para la barra, el informe y el favicon, porque siete capas a 16 px se emborronan.
- Concepto nuevo:
  - SVG: una imagen hecha con instrucciones en vez de píxeles, por eso se ve nítida a cualquier tamaño. Ejemplo: `<rect x="10" y="10" width="20" height="14" rx="7" />` dibuja una barra con las puntas redondeadas.
  - `viewBox="0 0 100 100"`: el dibujo se piensa en una caja de 100 × 100 y luego se estira al tamaño que le pidas (`width={20}`).
  - Colorear un dibujo desde CSS: las capas llevan `className="logo-layers"` y el CSS dice `.logo-layers{fill:var(--oro)}`. En el informe, `.report .logo-layers` lo pinta más oscuro sin tocar el dibujo.
- Cómo probarlo:
  1. `npm run dev`: arriba a la izquierda salen el logo y "layercents", y la pestaña del navegador muestra el icono nuevo.
  2. "Save quote" y "Customer quote" son botones de oro con texto oscuro; el material en la gráfica de capas también es de oro.
  3. Abre "PDF report": logo y barras en oro oscuro sobre blanco.
  4. Abre un presupuesto: abajo pone "Quote made with layercents · layercents.com".

### 2026-10-15, Presupuesto para el cliente: varias piezas, logo y PDF
- Archivo y sitio:
  - src/CustomerQuote.jsx (archivo nuevo): la pantalla del presupuesto. Arriba el formulario ("This quote" y "Your business") y abajo la hoja que sale en el PDF.
  - src/History.jsx: casillas para marcar presupuestos (columna nueva al principio de cada tabla), "Select all shown" y el botón "Customer quote (n)" debajo del buscador. Estado nuevo `selected`.
  - src/App.jsx: el import de CustomerQuote; dentro de App, el estado `quoteParts` y la función `openCustomerQuote` (justo antes de `currency`); la cuarta pantalla `view === 'quote'`; History recibe `onCustomerQuote`.
  - src/index.css, al final: sección "Presupuesto para el cliente".
  - README.md: la función nueva en Features y fuera del Roadmap.
- Qué cambió: en History marcas las piezas de un cliente y pulsas "Customer quote". Sale un presupuesto para mandarle, con tu logo, tu nombre y contacto, número, fecha y validez, las piezas con cantidad y precio, envío, impuesto (por ejemplo el 21 % de IVA), total y notas. Puedes cambiar cantidades y precios solo para ese presupuesto, sin tocar el historial. "Save as PDF" lo guarda como PDF, igual que el informe.
- Por qué:
  - Es lo que hace un vendedor cada día: mandar al cliente un presupuesto con varias piezas. MakerQuote y 3DPCC lo cobran en su plan PRO.
  - La hoja del cliente solo enseña precios: nada de costes, márgenes ni comisiones, que son cosa tuya.
  - Los datos de tu negocio (logo, nombre, contacto, notas, impuesto y validez) se guardan en el navegador (clave `business`) y se reutilizan en el siguiente presupuesto. El número sube solo (2026-001, 2026-002…) la primera vez que guardas el PDF (clave `quoteCounter`).
  - Cada importe se redondea al céntimo antes de sumar, así las líneas siempre suman exactamente el total que lee el cliente. Sin esto, con envío e IVA salía un total que no cuadraba por un céntimo.
  - El logo se reduce a 480 × 200 px como mucho antes de guardarlo, porque localStorage tiene poco sitio (unos 5 MB).
  - Abajo de la hoja pone "Quote made with Print Cost": cada presupuesto que manda alguien hace publicidad de la web. Quitar esa línea podría ser una función de pago más adelante.
- Concepto nuevo:
  - `Set`: una colección sin repetidos. `selected.has(id)` dice si una fila está marcada. Para que React lo note se crea un Set nuevo en cada cambio: `const next = new Set(prev); next.add(id)`.
  - Trabajar en céntimos enteros: con decimales el ordenador se equivoca un pelín (`0.1 + 0.2` da `0.30000000000000004`). Con céntimos (`Math.round(n * 100)`) se suman enteros y no hay error: `10 + 20` da `30`.
  - `<canvas>` para encoger imágenes: se dibuja la imagen más pequeña y `canvas.toDataURL('image/png')` la convierte en texto, que sí se puede guardar en localStorage.
  - `defaultValue` + `key`: el precio va en un input "no controlado" (React no lo reescribe a cada tecla, así el cursor no salta). Al cambiar de moneda cambia la `key` y React vuelve a dibujar el input con el número convertido.
- Cómo se probó: recorrido completo en un navegador simulado: marcar piezas, abrir el presupuesto, cliente puesto solo, cantidades, envío, impuesto, totales que cuadran, nombre y notas guardados, número que sube una sola vez, cambio a USD, quitar una línea, volver sin tocar el historial y un segundo presupuesto con el número siguiente. Falta probar en tu navegador subir un logo y sacar el PDF de verdad.
- Cómo probarlo:
  1. `npm run dev` y guarda 2 o 3 presupuestos con el mismo cliente.
  2. En History marca sus casillas: el botón dice "Customer quote (2)". Púlsalo.
  3. Rellena "Your business": sube tu logo y pon nombre y contacto. Recarga, vuelve a abrirlo y siguen ahí.
  4. Cambia la cantidad de una pieza, pon envío y 21 en "Tax (%)": la hoja cambia al momento y el total cuadra con las líneas.
  5. Pulsa "Save as PDF" y elige "Guardar como PDF": solo sale la hoja, sin formulario ni botones, y el nombre propuesto es "Quote 2026-001 Cliente".
  6. Abre otro presupuesto: el número ya es 2026-002.
  7. En el móvil el formulario va en una columna, y la tabla de la hoja se desliza de lado si no cabe.

### 2026-10-15, README al día: funciones y roadmap
- Archivo y sitio: README.md, secciones "Features" y "Roadmap".
- Qué cambió: Features ya incluye la importación del laminador (la primera, en negrita), el historial, el Excel y el informe PDF. En Roadmap se quitaron "borrar presupuestos" y "CSV" (ya hechos; el CSV se cambió por Excel) y entraron las próximas funciones.
- Por qué: el README es lo primero que ve la gente que llega desde Reddit o GitHub, y la importación es lo que nos diferencia de la competencia.
- Concepto nuevo: `**texto**` en Markdown se ve en negrita.
- Cómo probarlo: abre README.md en GitHub (o en VS Code con la vista previa) y comprueba las dos listas.

### 2026-10-15, Importar tiempo y gramos desde el archivo del laminador
- Archivo y sitio:
  - src/slicerFile.js (archivo nuevo): lee el archivo del laminador y saca el tiempo, los gramos, la purga y los filamentos. Son funciones puras: no saben nada de React ni de la pantalla.
  - src/ImportFile.jsx (archivo nuevo): el panel "Import from your slicer", con la zona para soltar, el botón "Choose file", el resumen, "Parts on this plate" y "Undo".
  - src/App.jsx: el import de ImportFile; dentro de la función App, justo después de `set`, el estado `beforeImport` y las funciones `applyImport` y `undoImport`; en el JSX, `<ImportFile />` como primer panel de la columna del formulario.
  - src/index.css, al final: sección "Importar del laminador".
  - package.json: `fflate` pasa a ser dependencia directa (ver "Por qué").
- Qué cambió: encima del formulario hay un panel nuevo. Sueltas en cualquier sitio de la página (o eliges con "Choose file") un .gcode, .bgcode o .gcode.3mf de Bambu Studio, OrcaSlicer, PrusaSlicer o Cura, y se rellenan solos "Print time", "Part weight" y "Purge & waste". Si en la bandeja hay varias piezas, pones cuántas en "Parts on this plate" y se divide. Si el 3MF tiene varias bandejas, eliges una o "All plates". "Undo" devuelve los números de antes.
- Por qué:
  - Ninguna calculadora de la competencia lo hace (MakerQuote, 3DPCC y CraftersQuote te hacen copiar a mano lo que dice el laminador). Quita el paso más pesado y los errores al copiar.
  - El archivo se lee dentro del navegador y no se sube a ningún sitio, así que sigue siendo verdad el "nothing is sent to any server".
  - Del G-code solo se leen el primer y el último mega, que es donde los laminadores escriben estos datos. Así un archivo de 200 MB no congela la página.
  - Purga: PrusaSlicer dice cuánto filamento fue a la torre de purga y se separa del peso de la pieza. Bambu Studio y Orca no lo separan en el archivo: va dentro del total, así que la purga se pone a 0 para no contarla dos veces, y el panel lo avisa.
  - fflate: un 3MF por dentro es un zip y hay que descomprimirlo. No es una librería nueva de verdad: ya estaba en el proyecto porque write-excel-file la usa para crear el .xlsx. Ahora la usamos también directamente (por eso aparece en package.json) y solo se descarga cuando alguien suelta un 3MF (unos 7 KB).
- Concepto nuevo:
  - Expresiones regulares (regex): patrones para buscar trozos de texto. `/total filament used \[g\]\s*=\s*([\d.]+)/` busca esa frase y guarda el número que va detrás. Ejemplo: `'peso = 12.5'.match(/peso = ([\d.]+)/)[1]` da `'12.5'`.
  - `file.slice(inicio, fin).text()`: lee solo un trozo de un archivo. Ejemplo: `await file.slice(0, 1024).text()` lee el primer kilobyte.
  - Un .gcode.3mf es un zip: dentro, `Metadata/slice_info.config` es un texto XML con el tiempo de cada bandeja (`prediction`, en segundos) y sus gramos (`weight`).
  - Arrastrar y soltar: los eventos `dragover` y `drop` de la ventana. `e.preventDefault()` evita que el navegador abra el G-code como una página llena de texto.
  - `useRef`: una "caja" que guarda algo entre renders sin redibujar la pantalla. Aquí guarda el input de archivo escondido (para abrirlo desde el botón) y la versión más nueva de `handleFile` (para los eventos de la ventana, que se crean una sola vez).
  - `class ImportError extends Error`: un tipo de error propio. Si el fallo es de este tipo, su mensaje ya está escrito para la persona; si es de otro tipo, es un bug y además va a la consola.
- Cómo se probó: con G-code real de PrusaSlicer 2.7.2 (una pieza, dos materiales con torre de purga de 14 g y el .bgcode binario), con archivos de muestra con el formato de Bambu Studio, OrcaSlicer y Cura, y con un G-code de 6 MB. También se recorrió el panel entero en un navegador simulado: elegir archivo, piezas por bandeja, Undo, soltar un 3MF de dos bandejas, error con un .stl y guardar presupuesto después de importar. Falta probarlo con un .gcode.3mf real tuyo de Bambu Studio.
- Cómo probarlo:
  1. `npm run dev`.
  2. En Bambu Studio u OrcaSlicer, lamina algo y usa "Export plate sliced file" (sale un .gcode.3mf). Suéltalo en la página: cambian "Print time" y "Part weight", y arriba sale el resumen con el tiempo, los gramos y los filamentos con su color.
  3. Pon 4 en "Parts on this plate": el tiempo y los gramos se dividen entre 4.
  4. Pulsa "Undo": vuelven los números que había antes.
  5. Con un 3MF de varias bandejas aparece "Plate": cambia de bandeja o elige "All plates".
  6. En PrusaSlicer, exporta el G-code de algo multicolor con torre de purga: "Purge & waste" se rellena con lo de la torre.
  7. Suelta un .stl: sale un aviso en rojo (es un modelo, no un archivo laminado) y el formulario no cambia.
  8. En el móvil, "Choose file" abre el selector de archivos.

### 2026-10-14, README nuevo del proyecto
- Archivo y sitio: README.md (todo el archivo; lo escribió Julen).
- Qué cambió: se sustituyó el README de la plantilla de Vite por uno propio, con descripción, enlace a la web, funciones, cómo ejecutarlo en local y roadmap.
- Por qué: el README es lo primero que ve quien entra al repositorio desde Reddit o GitHub.
- Concepto nuevo: no hay.
- Cómo probarlo: abre el repositorio en GitHub y comprueba que la portada muestra el README nuevo. Pendiente: añadir Excel, History y PDF report a la lista de Features.

### 2026-10-14, CLAUDE.md al día: estado actual y pendientes
- Archivo y sitio: CLAUDE.md, secciones "Estado actual" y "Pendiente, por orden".
- Qué cambió: se apuntó todo lo hecho hoy (History, Excel, PDF report) y se reordenaron los pendientes. Lo siguiente es "piezas por semana".
- Por qué: CLAUDE.md es lo primero que lee Claude en cada sesión. Si dice que falta algo que ya está hecho, la próxima vez empezaría por el sitio equivocado.
- Concepto nuevo: no hay.
- Cómo probarlo: abre CLAUDE.md y comprueba que "Pendiente" empieza por "piezas por semana".

### 2026-10-14, Informe en PDF con gráficas ("PDF report")
- Archivo y sitio:
  - src/Report.jsx (archivo nuevo): la pantalla del informe, con sus cálculos y gráficas.
  - src/History.jsx: botón "PDF report" junto a "Export Excel", en la zona de búsqueda.
  - src/App.jsx: import de Report, estado `report` y función `openReport` (junto al estado `view`), la tercera pantalla `view === 'report'` y la clase `no-print` en la barra superior.
  - src/index.css, al final: sección "Informe (PDF)", con los colores de papel como variables (`--papel`, `--tinta`…), los estilos de las gráficas y el bloque `@media print`.
- Qué cambió: en History, "PDF report" abre un informe que parece una hoja blanca. Incluye cabecera con fechas, 5 cifras clave (presupuestos, total, precio medio, coste medio y beneficio medio tras comisiones), una gráfica de columnas con el valor presupuestado por mes, una gráfica de en qué se va el coste de una pieza media, los mejores clientes y la tabla con todos los presupuestos y su total. "Save as PDF" abre la ventana de imprimir del navegador, donde eliges "Guardar como PDF".
- Por qué:
  - Un PDF así se puede mandar a un cliente o usar para ver cómo va el negocio cada mes. Es lo que hace que la app parezca un programa de verdad.
  - Usar la impresión del navegador en vez de una librería de PDF evita una dependencia pesada, y el texto del PDF sale nítido y se puede seleccionar.
  - Cada gráfica tiene un solo color (el verde de la app) y el valor escrito al lado, así se entiende aunque se imprima en blanco y negro.
  - El informe usa lo que se ve en History: si buscas "Ana", el informe es solo de Ana y en la cabecera pone "filtered by “Ana”".
- Concepto nuevo:
  - `@media print { ... }`: estilos que solo se aplican al imprimir. Aquí se esconden la barra superior y los botones (`.no-print`) y se fija el tamaño A4 con `@page`. Ejemplo: `@media print { .menu { display: none } }`.
  - `print-color-adjust: exact`: por defecto el navegador no imprime colores de fondo (para ahorrar tinta), y las barras de las gráficas son fondos. Esta línea lo obliga a imprimirlos.
  - `break-inside: avoid`: le pide a la impresora que no corte un bloque (una gráfica) entre dos páginas. La tabla sí puede partirse, y su cabecera se repite sola en cada página.
  - `window.print()`: abre la ventana de imprimir, igual que pulsar Cmd+P.
  - `document.title`: el título de la pestaña es también el nombre que el navegador propone para el PDF. Mientras el informe está abierto se cambia a "Print Cost report AAAA-MM-DD" y al salir se devuelve el de antes (con la limpieza de `useEffect`, como en el aviso de guardado).
  - Gráficas sin librería: cada barra es un `<span>` con `width` o `height` en %. Si el mes más alto vale 100 € y otro 50 €, el segundo mide `height: 50%`.
- Cómo probarlo:
  1. `npm run dev`. Ten al menos 3 o 4 presupuestos guardados con clientes distintos (si todos son de hoy, la gráfica por meses tendrá una sola columna).
  2. Ve a History y pulsa "PDF report": ves la hoja blanca con las cifras, las 3 gráficas y la tabla con su total.
  3. Pulsa "Save as PDF". En la ventana de imprimir, elige "Guardar como PDF" como destino. En la vista previa no deben salir la barra superior ni los botones, las barras deben verse verdes y el nombre propuesto debe ser "Print Cost report AAAA-MM-DD".
  4. Si tienes más de 10 o 12 presupuestos, la tabla sigue en la página 2 con la cabecera repetida, y el "Total" solo sale al final.
  5. Vuelve con "← Back to history", busca un cliente y abre el informe otra vez: solo salen sus presupuestos, y arriba pone "filtered by".
  6. Cambia la moneda a USD y abre el informe: todo sale en USD.
  7. En el móvil, la hoja cabe en pantalla y la tabla se desliza de lado.

### 2026-10-14, Pantalla de historial (History) con resumen, búsqueda, meses y "Load"
- Archivo y sitio:
  - src/History.jsx (archivo nuevo): toda la pantalla del historial.
  - src/App.jsx: el import de History; dentro de la función App, la carga de `savedQuotes` (ahora con `try/catch`), los nuevos `justSaved` y `loadQuote` junto a `saveQuote`, el estado `view`, y en el JSX la barra superior (pestañas + moneda), el aviso "Saved · View history" y el cambio entre pantallas. La lista de presupuestos que había en la calculadora se ha quitado, porque ahora vive en History.
  - src/index.css: estilos de las pestañas y del selector de moneda en la barra superior, de los botones `.controls` (ahora oscuros, como el resto de la app, y "Save quote" en verde), del aviso de guardado y de toda la sección "Historial". Se borraron los estilos de la lista antigua.
- Qué cambió:
  - Arriba hay dos pestañas, "Calculator" y "History (n)", y el selector de moneda pasa a la barra superior porque afecta a las dos pantallas.
  - History muestra 4 tarjetas resumen (número de presupuestos, total presupuestado, precio medio por pieza y número de clientes), un buscador por pieza o cliente y una tabla agrupada por meses, con el total de cada mes, del más nuevo al más antiguo.
  - Cada fila tiene "Load", que vuelve a cargar ese presupuesto en la calculadora (números, nombre y cliente), y ✕ para borrar, que ahora pide confirmación.
  - "Export Excel" está en History y exporta solo lo que estás viendo: si buscas "Ana", exporta solo los de Ana.
  - Al guardar, sale "Saved “nombre” · View history" durante 5 segundos.
- Por qué:
  - Un programa profesional separa "hacer un presupuesto" de "consultar los antiguos". Tener la lista debajo de la calculadora no escalaba con 50 presupuestos.
  - "Load" sirve para repetir un pedido o hacer una variante sin volver a escribir los 17 datos.
  - El `try/catch` al leer localStorage evita que la app entera se quede en blanco si los datos guardados se corrompen.
  - Los presupuestos antiguos (sin datos de formulario) tienen el botón "Load" desactivado, porque no hay nada que cargar.
- Concepto nuevo:
  - Componente en otro archivo con props: `<History quotes={...} onLoad={...} />`. History no guarda datos propios; recibe la lista y avisa a App con funciones (`onLoad`, `onDelete`). Es como llamar a una función pasándole parámetros.
  - Renderizado condicional con `? :`: `{view === 'history' ? <History/> : <Calculadora/>}` enseña una pantalla u otra según el valor de `view`, sin cambiar de página.
  - `new Set(...)`: una colección que no admite repetidos. `new Set(['Ana', 'Ana', 'Luis']).size` da 2. Se usa para contar clientes distintos.
  - Limpieza en `useEffect`: el `return () => clearTimeout(timer)` cancela el temporizador si guardas otro presupuesto antes de que pasen los 5 segundos, para que no se mezclen los avisos.
  - `.sort((a, b) => b - a)`: ordena de mayor a menor. Restar dos fechas da la diferencia en milisegundos, así que quedan primero las más nuevas.
- Cómo probarlo:
  1. `npm run dev`. Arriba verás "Calculator" e "History" con un número.
  2. En la calculadora, escribe un nombre y un cliente y pulsa "Save quote". Sale el aviso en verde, pulsa "View history".
  3. En History comprueba las 4 tarjetas y que la tabla está agrupada por mes, con el total del mes a la derecha.
  4. Escribe un cliente en el buscador: la tabla, las tarjetas y el número del botón "Export Excel" cambian.
  5. Pulsa "Export Excel" con la búsqueda puesta: el Excel solo trae esos presupuestos.
  6. Pulsa "Load" en una fila: vuelves a la calculadora con sus números, nombre y cliente.
  7. Pulsa ✕: pide confirmación y, si aceptas, desaparece.
  8. Cambia la moneda arriba a la derecha: cambian las dos pantallas.
  9. Borra todos: sale el mensaje "No saved quotes yet" con un botón para volver a la calculadora.
  10. En el móvil (o con la ventana estrecha), la tabla se desliza de lado dentro de su caja y la página no se desborda.

### 2026-10-14, Exportación a Excel (.xlsx) y presupuestos con nombre, cliente y desglose
- Archivo y sitio:
  - src/exportExcel.js (archivo nuevo): todo el código que construye el Excel.
  - src/App.jsx, dentro de la función App: `saveQuote` (ahora guarda muchos más datos), los estados nuevos `quoteName` y `quoteClient`, la función `exportExcel` (sustituye a `exportCSV`), el formulario `save-bar` debajo de la barra de botones y la fila de cada presupuesto en la lista.
  - src/index.css, al final: estilos del formulario (`.save-bar`, `.text-input`) y del nombre en la lista (`.quote-info`, `.quote-name`).
  - package.json: nueva dependencia `write-excel-file`. Al instalarla, npm también arregló las sangrías del archivo.
- Qué cambió:
  - Al guardar un presupuesto puedes escribir el nombre de la pieza y el cliente (este es opcional). Se guarda también una copia de todos los datos del formulario y del desglose de costes.
  - El botón "Export CSV" pasa a ser "Export Excel" y descarga un `.xlsx` de verdad: título, fecha de exportación, cabecera oscura fija al hacer scroll, columnas con ancho ajustado, filas alternas en gris, importes con 2 decimales, margen y comisión en %, y una fila de totales con fórmulas.
  - Columnas: Date, Part, Client, Qty, Weight (g), Print time (h), Material, Power, Depreciation, Failures, Labor, Packaging, Cost / part, Margin, Fee, Price / part y Order total.
- Por qué:
  - Un CSV es solo texto: sin negritas, sin formato de moneda y, en el Excel en español, a veces sale todo en una sola columna. Un .xlsx se abre bien en Excel, Numbers y Google Sheets y tiene aspecto profesional.
  - Guardar el desglose completo es la base para el historial (parte B) y el informe PDF (parte C): sin esos datos no se pueden hacer gráficas después.
  - Nueva dependencia, `write-excel-file`: escribir un .xlsx a mano es muy complejo (por dentro es un zip con varios archivos XML). Esta librería es pequeña, tiene licencia MIT y solo se descarga cuando alguien pulsa el botón, así que la página no carga más lenta.
  - Los presupuestos guardados antes de este cambio siguen funcionando: en el Excel salen con fecha, coste y precio, y el resto de columnas vacías.
- Concepto nuevo:
  - `import()` dinámico: `await import('./exportExcel.js')` carga un archivo solo cuando se ejecuta esa línea, no al abrir la página. Vite lo separa en su propio archivo (`exportExcel-xxxx.js`). Ejemplo: `const { suma } = await import('./mates.js')`.
  - `async` / `await` y `try / catch / finally`: `await` espera a que termine algo lento (cargar el archivo, crear el Excel). `try` intenta hacerlo, `catch` se ejecuta si algo falla (y se muestra un aviso) y `finally` se ejecuta siempre (aquí, para volver a activar el botón).
  - `<form onSubmit>` y `e.preventDefault()`: meter los campos en un formulario hace que pulsar Enter también guarde. Por defecto un formulario recarga la página al enviarse, y `preventDefault()` lo evita.
  - `??` (operador "si no existe"): `q.units ?? 1` significa "usa q.units y, si no existe, usa 1". Sirve para los presupuestos antiguos, que no tienen esos datos.
- Cómo probarlo:
  1. `npm run dev` y abre la URL que aparece.
  2. Debajo de los botones verás dos cajas: escribe "Phone stand" y "Ana" y pulsa "Save quote" (o Enter). Las cajas se vacían y en la lista aparece "Phone stand" con "Ana · fecha" debajo.
  3. Guarda otro sin nombre: aparece como "Untitled part".
  4. Pon "Order quantity" a 3, guarda otro y pulsa "Export Excel". Se descarga `print-quotes-AAAA-MM-DD.xlsx`.
  5. Ábrelo en Excel, Numbers o Google Sheets: título arriba, cabecera oscura, una fila por presupuesto y abajo "Total", con la suma de Qty y de Order total. Haz scroll hacia abajo y la cabecera se queda fija.
  6. Cambia un número de "Order total" en Excel: el total de abajo se recalcula solo, porque es una fórmula.
  7. Cambia la moneda a USD y exporta otra vez: las cabeceras dicen "(USD)" y los importes salen convertidos.
  8. Si tenías presupuestos guardados de antes, salen en la lista como "Untitled part" y en el Excel con fecha, coste y precio.

### 2026-10-14, Botón "Export CSV" para los presupuestos guardados
- Archivo y sitio:
  - src/App.jsx, dentro de la función App: la nueva función `exportCSV` (justo antes de `botonApagarCalculo`) y el botón "Export CSV" al final del panel "Saved quotes".
  - src/index.css, al final: estilo `.quotes-actions`, la franja inferior del panel donde está el botón.
- Qué cambió: debajo de la lista de presupuestos hay un botón "Export CSV" que descarga un archivo `print-quotes-AAAA-MM-DD.csv` con las columnas Date, Cost, Price y Currency.
- Por qué: así puedes llevarte los presupuestos a Excel o Google Sheets para sumarlos o compararlos, sin depender del navegador. Los importes salen en la moneda que tengas elegida en ese momento, igual que en pantalla, y la columna Currency indica cuál es.
- Concepto nuevo:
  - CSV: un archivo de texto donde cada línea es una fila y las comas separan las columnas. Cada valor va entre comillas para que una fecha con coma ("Oct 14, 2026") no se parta en dos columnas.
  - `Blob` y `URL.createObjectURL`: un Blob es un "archivo en memoria" creado desde JavaScript. createObjectURL le da una dirección temporal, y un enlace `<a download>` con esa dirección hace que el navegador lo descargue. Ejemplo: `new Blob(['hola'], { type: 'text/plain' })`.
  - `URL.revokeObjectURL` libera esa dirección temporal cuando ya no hace falta, para no ocupar memoria.
- Cómo probarlo:
  1. `npm run dev` y guarda 2 o 3 presupuestos con "Save quote".
  2. Pulsa "Export CSV" (abajo a la derecha del panel "Saved quotes"): se descarga `print-quotes-2026-10-14.csv`.
  3. Ábrelo con un editor de texto: una línea de cabecera y una línea por presupuesto, con los mismos importes que ves en pantalla.
  4. Cambia la moneda a USD, exporta otra vez y comprueba que los importes cambian y que la columna Currency dice USD.
  5. Ábrelo en Google Sheets (Archivo > Importar): cada dato sale en su columna. En Excel en español puede que todo salga en una sola columna, porque allí el separador esperado es el punto y coma. Google Sheets o "Datos > Desde texto" lo resuelven.
  6. Borra todos los presupuestos: el panel desaparece y con él el botón, así que nunca se exporta un CSV vacío.

### 2026-10-14, CLAUDE.md y DEV_LOG.md pasan a la raíz del proyecto
- Archivo y sitio: CLAUDE.md y DEV_LOG.md, que antes estaban en src/ y ahora están en la carpeta principal (coste-3d/).
- Qué cambió: los dos archivos se movieron a la raíz y claude.md pasó a llamarse CLAUDE.md, en mayúsculas. No se tocó nada de código.
- Por qué: Claude Code solo lee automáticamente el CLAUDE.md de la raíz. El nombre en mayúsculas importa en Linux y en la nube, que sí distinguen mayúsculas de minúsculas (tu Mac no).
- Concepto nuevo: no hay.
- Cómo probarlo: `ls` en la carpeta del proyecto muestra CLAUDE.md y DEV_LOG.md, y src/ ya no los tiene.

### 2026-10-14, Lista de presupuestos guardados: fecha, borrar y nuevo aspecto
- Archivo y sitio:
  - src/App.jsx, dentro de la función App: `deleteQuote` (junto a `saveQuote`) y el bloque JSX que va justo después del subtítulo, antes de `<div className="columns">`.
  - src/index.css, al final, en la sección "Presupuestos guardados".
- Qué cambió: cada presupuesto guardado se ve ahora como una fila de tabla con fecha, coste, precio y un botón ✕ para borrarlo. Los tres controles (Show cost only, Save quote y el selector de moneda) van juntos en una barra, y la lista aparece debajo, ya no metida entre los botones. También se quitó el `console.log('guardando...')`, que era para depurar.
- Por qué: antes la lista salía en mitad de la fila de botones y los datos iban pegados en un solo texto, así que costaba leerla. Sin el botón de borrar, la única forma de limpiar la lista era vaciar el localStorage a mano.
- Concepto nuevo:
  - `.filter` crea un array nuevo solo con los elementos que cumplen una condición. `deleteQuote` se queda con todos los presupuestos menos el que tiene el `id` pulsado. Ejemplo: `[1, 2, 3].filter(n => n !== 2)` da `[1, 3]`. Así no se modifica el array original, que es lo que React necesita para notar el cambio.
  - CSS Grid con `grid-template-columns: 1fr auto auto 26px`: la cabecera y cada fila usan las mismas cuatro columnas (la fecha ocupa el espacio que sobra, coste y precio lo que necesitan, y el botón 26 px), por eso todo queda alineado como en una tabla.
  - `aria-label` en el botón ✕: un lector de pantalla leería solo "✕", y con esto lee "Delete quote from 14/10/2026".
- Cómo probarlo:
  1. `npm run dev` y abre la URL que aparece.
  2. Pulsa "Save quote" dos o tres veces cambiando algún valor entre medias (por ejemplo "Part weight").
  3. Comprueba que debajo de los botones sale "Saved quotes (3)" con una fila por presupuesto: fecha a la izquierda, coste y precio en verde a la derecha, alineados en columna.
  4. Pulsa ✕ en la fila del medio: desaparece solo esa y el contador baja.
  5. Recarga la página: la fila borrada sigue sin aparecer (se guarda en localStorage).
  6. Borra todas: el panel desaparece entero.
  7. Cambia la moneda a USD: los importes de la lista se convierten.
  8. Estrecha la ventana a tamaño móvil y comprueba que la barra de botones baja a otra línea sin desbordarse.
