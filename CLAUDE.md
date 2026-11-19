# Proyecto: layercents (calculadora de coste de impresión 3D)

Calculadora web del coste real de una pieza impresa en 3D y presupuestos para el cliente. La marca es layercents. React + Vite, desplegada en GitHub Pages con dominio propio: https://layercents.com (comprado en Cloudflare; en su DNS hay 4 registros A a GitHub Pages y un CNAME `www` a llopjulen.github.io, con el proxy de Cloudflare activado, la nube naranja, que es quien pone el candado HTTPS. En Cloudflare tiene que estar activado "Always Use HTTPS", para que nadie use la versión http y se le separen los datos guardados). El archivo public/CNAME le dice a GitHub qué dominio usar: no lo borres. El código, los comentarios de la interfaz y los nombres de claves están en inglés; los textos que ve la persona viven en src/i18n/ en tres idiomas (en, es, fr): todo texto nuevo se escribe con `t('clave')` y se añade a los TRES diccionarios (`npm test` falla si falta alguno). El inglés es la referencia.

## Sobre el dueño
Julen, 21 años, estudia Ingeniería Informática a distancia y trabaja a jornada completa. Tiene poco tiempo y quiere entender lo que hace el proyecto aunque no lo escriba él. Se defiende programando: explícale en español y a nivel de ingeniero, con el término técnico correcto y el porqué de cada decisión, sin simplificar ni tratarle como a un principiante.

## Regla principal: registro de cambios
Después de CADA cambio en el código, añade una entrada al principio de DEV_LOG.md con este formato:

### AAAA-MM-DD, título corto
- Archivo y sitio: ruta del archivo y zona (por ejemplo "src/App.jsx, dentro de la función App, junto a saveQuote")
- Qué cambió: una o dos frases
- Por qué: el motivo técnico de cada decisión y las alternativas descartadas
- Concepto nuevo: si usa algo que Julen no ha visto (por ejemplo .filter, Blob), explícalo en 2-3 líneas con un ejemplo mínimo
- De la carrera: si el cambio usa algo que se estudia en Ingeniería Informática, di de qué asignatura viene y dónde se ve en este código (por ejemplo "Sistemas Operativos: la señal SIGINT que captura agent/server.js" o "Bases de datos: transacción con rollback en writeAtomically"). Si no hay ninguna, se omite la línea.
- Cómo probarlo: pasos concretos para ver que funciona

No hagas ningún cambio sin dejar su entrada.

## Reglas de trabajo
- Cambios pequeños, uno por tarea, y un commit por cada uno con mensaje claro en inglés.
- Antes de dar algo por terminado, ejecuta `npm run build`. Si falla, arréglalo.
- Cada tarea llega como pull request: rama `feature/...` contra `main`, con el código comentado explicando el porqué. Julen lo revisa, lo cambia o lo acepta.
- Nunca hagas push a `main` ni `npm run deploy`: eso lo hace Julen después del merge. Al abrir el PR, dile qué probar.
- No añadas dependencias nuevas sin explicar por qué hacen falta.
- No metas backend, cuentas de usuario ni bases de datos fuera de lo acordado. La app guarda datos en localStorage. Dos excepciones:
  - Acordada el 2026-10-22: el agente local de agent/ (Node, escucha solo en 127.0.0.1) para conectar impresoras. Mantén su seguridad: Host local, lista de Origin permitidos, CORS y `PROTOCOL` subido si cambia su API.
  - Acordada el 2026-10-28, diseño en docs/NUBE.md (ampliado el 2026-11-05 con el modo taller de varias personas y roles, docs/TALLER.md): cuentas, sincronización y flota de impresoras en la nube con Supabase, y cobro con Polar (decidido el 2026-11-04; antes Lemon Squeezy), en PRs por pasos. La calculadora tiene que seguir funcionando sin cuenta. El agente solo abre conexiones salientes a la nube si la persona vincula su cuenta, y nunca sube el código de acceso, el número de serie, la IP ni la huella del certificado de una impresora. Las claves secretas (`service_role` de Supabase, claves y secretos de Polar) no van nunca en el repositorio ni en el chat; la `anon key` y la URL, en `.env.local`.
- Nunca escribas claves, tokens ni emails personales en el código.
- Git usa el email noreply de GitHub; no lo cambies.
- Antes de tocar la interfaz, lee DESIGN.md (el sistema de diseño, al día desde el 2026-11-06) y compruébalo con `npm run build && npm run shots` (14 vistas a 4 anchos × 2 temas en shots/). Las reglas de Vercel (Web Interface Guidelines) se pasaron el 2026-11-06; repásalas en cada pantalla nueva.
- Mantén el estilo actual (rediseño del 2026-11-03): listas agrupadas al estilo de Ajustes de Apple (título pequeño y gris fuera del grupo, filas de 48 px con separadores finos, valores a la derecha sin caja), grupos sin borde sobre un fondo un escalón más oscuro, Inter para todo (la Bricolage solo en el nombre de la marca) y el oro de la marca (`--oro`) reservado al precio, al botón principal y a marcar dónde estás. Nada de neón, degradados ni brillos. Colores definidos como variables en index.css. El logo está en src/Logo.jsx; no uses el verde de Bambu Lab.
- Si una petición es ambigua o crece demasiado, para y pregunta antes de construir.
- docs/MAPA.md es el mapa del código para que Julen se oriente: actualízalo en cada PR que añada archivos o claves de localStorage o que cambie el flujo de datos.
- Si añades una clave nueva a localStorage o un campo nuevo a los presupuestos, añádelo también a src/backup.js (copia y validación). Si el cambio rompe el formato del archivo, sube `BACKUP_SCHEMA_VERSION` y añade una migración: los archivos que la gente ya ha descargado se tienen que seguir restaurando.

## Estado actual
Hecho: desglose de costes con gráfica por capas, precio recomendado, toggle "Show cost only", selector de moneda con tipos de cambio en vivo (api.frankfurter.dev/v1, ahora en la barra superior), README.
Hecho el 2026-10-14 (ver DEV_LOG.md):
- Guardar presupuesto con nombre de pieza, cliente y copia completa de datos y desglose (en localStorage, clave `savedQuotes`).
- Pestaña History (src/History.jsx): tarjetas resumen, buscador, tabla agrupada por mes, "Load" para volver a cargar un presupuesto y borrar con confirmación.
- Export Excel .xlsx con formato (src/exportExcel.js, librería write-excel-file, cargada solo al pulsar). Sustituye al CSV.
- PDF report (src/Report.jsx): informe imprimible con 5 cifras clave, 3 gráficas y tabla. Se guarda con "Guardar como PDF" del navegador.
Hecho el 2026-10-15 (ver DEV_LOG.md):
- Importar del laminador (src/slicerFile.js y src/ImportFile.jsx): soltar un .gcode, .bgcode o .gcode.3mf rellena tiempo, gramos y purga, con piezas por bandeja, elección de bandeja y Undo. Usa fflate, cargada solo al soltar un 3MF.
- Presupuesto para el cliente (src/CustomerQuote.jsx): se marcan piezas en History y sale un presupuesto con logo y datos del negocio (clave `business`), número automático (clave `quoteCounter`), envío, impuesto y notas. Importes en céntimos para que cuadren. PDF con window.print(), como el informe.
Hecho el 2026-10-16 (ver DEV_LOG.md):
- Nueva marca: layercents, con logo (src/Logo.jsx) y el oro como color en vez del verde. Iconos e imagen para compartir en public/.
- La web pasa a https://layercents.com (base de Vite `/` y public/CNAME).
- Publicado todo lo anterior en layercents.com el 2026-10-16. La versión vieja no guardaba nada en el navegador, así que con el cambio de dirección nadie perdió datos.
- Repaso visual (publicado el mismo día): barra de arriba en dos filas en el móvil, barra fija con coste y precio en el móvil, tres pasos bajo el título, títulos con la letra del logo, pie de página con enlace a GitHub y fechas tipo "12 Oct 2026". Quitada la frase "Filament is only X%".
- Portada de GitHub: README con logo y capturas (carpeta screenshots/) y el paquete se llama layercents. Los ajustes del repositorio (nombre, About, temas, imagen para compartir) no se pueden cambiar desde Claude: los cambia Julen en GitHub.
Hecho el 2026-10-22 (ver DEV_LOG.md), publicado ese mismo día:
- Rediseño de la calculadora (llegó a main con el PR #14): gráfica de costes con el símbolo ¢ (src/symbolChart.js, src/CostSymbol.jsx), precio recomendado como protagonista, y "Your setup" (impresora, luz, tarifa, comisión y margen) guardado en el dispositivo (clave `setup`, también dentro de la copia de seguridad sin subir `schemaVersion`). Sustituye al botón "Show cost only".
- Copia de seguridad (src/backup.js y src/BackupPanel.jsx): "Download backup" baja un JSON versionado (`schemaVersion`) con `savedQuotes`, `business` y `quoteCounter`; "Restore from file" lo valida, enseña un resumen y deja elegir Merge o Replace. El contador de presupuestos nunca baja. Aviso en History y punto en la pestaña cuando toca copia (clave `lastBackupAt`, propia de cada dispositivo y fuera del archivo).
- Mapa del código en docs/MAPA.md: archivos, flujo de datos, claves de localStorage, fórmulas y dónde tocar para cada cambio.
- Agente local, paso 1 de la conexión con impresoras: servidor HTTP en agent/ (`npm run agent`, puerto 31415, solo `/health`) con tests en `node:test` (`npm test`).
- Paso 2: la web detecta el agente (src/agent.js, src/Printers.jsx). Pestaña Printers solo si la persona la activa con `layercents.com/?agent` (clave `agentEnabled`); sin activarla, la web no hace ninguna petición a 127.0.0.1.

Hecho el 2026-10-25 (ver DEV_LOG.md), en PRs sin mergear todavía (#16 a #20, todos contra main y construidos uno encima de otro: se mergean en orden):
- SEO básico (#16): título y descripción, canonical, robots.txt, sitemap.xml, datos estructurados y texto dentro de `#root`.
- Arreglos del móvil (#17): tabla del presupuesto entera, History con importes, meses del informe con año, un solo botón dorado en la copia.
- docs/IMPRESORAS.md (#18): cómo se conecta cada marca.
- Agente, paso 3 (#19): estado en vivo de las Bambu por MQTT, solo lectura (agent/mqtt.js, agent/drivers/bambu.js), impresoras en ~/.layercents/printers.json, `npm run agent -- add`, `GET /printers`, `PROTOCOL` 2.
- Pestaña Printers en vivo (#20).
- Plan de pago: documento aparte, privado (no va en el repositorio, que es público). Sin código de pagos.

Hecho el 2026-11-01 (ver DEV_LOG.md): la web está traducida a inglés, español y francés (src/i18n/, PRs #36 a #39 y el que enciende el selector). Selector EN/ES/FR en la barra (`READY=true`); sin elección guardada manda el idioma del navegador. El presupuesto del cliente y el informe PDF tienen su propio «Idioma del documento» (src/DocLangSelect.jsx). Hecho el 2026-11-02: una URL por idioma (`/`, `/es/`, `/fr/`) con `hreflang`, HTML prerrenderizado por `scripts/prerender.js` tras `vite build` y sitemap generado (la ruta manda sobre el idioma guardado). Falta que Julen envíe el sitemap nuevo en Search Console.

Hecho el 2026-11-03: rediseño sobrio (ver la regla de estilo) y vista 3D del archivo (src/PrintPreview.jsx, src/toolpath.js, src/preview.worker.js, dependencia `three` cargada solo al abrirla): recorrido del G-code o del `.gcode.3mf` por capas, y STL como sólido. El `.bgcode` aún no se puede ver. La gráfica del símbolo ¢ pasa a ser una barra apilada con filas de lista (se borran src/CostSymbol.jsx y src/symbolChart.js).
Hecho el 2026-11-04: registro de ventas (src/sales.js, src/SaleDialog.jsx). Cada presupuesto guardado tiene estado (presupuesto, pedido, vendido) y, si se vende, lo cobrado de verdad, comisiones, canal y fecha (campos `status` y `sale`, validados en backup.js). History filtra por estado y enseña cobrado, beneficio real y margen real; el Excel lleva tres columnas más. Pestaña «Planes» (src/Plans.jsx) con Gratis y Taller «Próximamente» (8,99 €/mes o 89 €/año, decidido por Julen el 2026-11-04); «Me interesa» lleva a /taller/ y las visitas a esa página en Cloudflare Web Analytics miden el interés. Cobro: Polar. El presupuesto para el cliente se personaliza: color, diseño (líneas, banda, mínimo) y letra (src/quoteStyle.js, campos `accent`, `docStyle` y `docFont` de `business`, validados en backup.js). Calendario (src/Calendar.jsx, src/schedule.js, src/OrderDialog.jsx): al pasar a pedido se pide fecha de entrega (sugerida con la cola de impresión, EDF, y las horas por semana); la pestaña enseña entregas, días de impresión estimados, ventas y pedidos que van tarde (campos `dueAt` y `orderedAt`, validados en backup.js). También se apuntan cosas a mano (src/calendarEvents.js, src/EventDialog.jsx, clave `calendarEvents`, dentro de la copia).

Hecho el 2026-11-10: el coste como objeto impreso en 3D encima de la barra de costes (src/CostPrint.jsx, src/costPrint.js): 56 capas coloreadas por parte del coste, en vivo, con resaltado desde la lista. three.js con `lazy()`. Si se suelta un archivo en Import (G-code, 3MF o STL), el objeto es esa pieza (prop `onFile` de ImportFile, `setModel` y `paintByHeight` en CostPrint).

Hecho el 2026-11-11: auditoría de diseño pantalla a pantalla, en ocho PRs (#78 a #85, publicados; detalle en DEV_LOG.md y reglas nuevas en DESIGN.md). Lo que queda como norma: el dinero se escribe siempre con `fmtMoney` («7,94 €» / «€7.94», nunca «EUR» tras la cifra); los campos numéricos son `type="text"` con `inputMode="decimal"` y la coma del idioma; ningún subtítulo bajo los títulos de pantalla; cifras sin datos detrás no se pintan; una cosa se dice una vez por pantalla; en la calculadora el h1 es solo para Google y lectores de pantalla y, en una columna, el precio y la pieza 3D van antes que los campos. `npm run shots` fotografía 14 vistas (incluye Impresoras con el agente demo, presupuesto, informe y estados vacíos).

## Pedidos y clientes: en curso, en PRs (decidido el 2026-11-04, diseño en docs/PEDIDOS.md)
Pedido como entidad propia (varias líneas, cliente, entrega, pagos e historial), estado y pago por separado, clientes como entidad. Claude hace el front sobre el adaptador de src/ordersStore.js (hoy localStorage); Julen escribe las tablas, RLS y el adaptador de Supabase con el mismo contrato, y Claude lo revisa y escribe los tests. Los cambios de modelo se acuerdan primero en docs/PEDIDOS.md.
1. Modelo, adaptador local, copia de seguridad y docs (PR `feature/orders-model`).
2. Pestaña Pedidos y Clientes (hecho el 2026-11-04: src/Orders.jsx, src/OrderDetail.jsx, src/NewOrderDialog.jsx, src/OrderParts.jsx, src/useOrders.js).
3. Conectar con Historial y Calendario y migrar los pedidos antiguos (hecho el 2026-11-04: `useOrders.importLegacy` al arrancar; el Historial crea pedidos y enlaza al suyo; el Calendario y la cola leen pedidos; fuera OrderDialog.jsx y SaleDialog.jsx; sales.js queda solo para validar y migrar datos antiguos).
Siguiente: la migración y el adaptador de Supabase de Julen (contrato en docs/PEDIDOS.md: `save_order(p_workspace_id uuid, p_order jsonb)` con `security invoker`, `next_order_number(p_workspace_id uuid)`). **Cambiado el 2026-11-05 por el modo taller (docs/TALLER.md, léelo antes de tocar el esquema):** los datos son de un taller (`workspace_id`, no `user_id`; una cuenta suelta es un taller de una persona), con roles jefe / encargado / operario, y producción y finanzas en tablas separadas porque RLS filtra filas y no columnas. Los tests ya están en el modelo de taller (reescritos el 2026-11-06): supabase/tests/workspaces.test.sql (núcleo del taller), supabase/tests/orders.test.sql (89, con pruebas de rol) y scripts/db/order-numbers-race.sh. La migración de Julen tiene que pasar `npm run test:db`. Claude revisa la migración.

## Conexión con impresoras: en curso, un PR por paso
Investigación por marca, protocolos, puertos y orden en docs/IMPRESORAS.md: léelo antes de tocar el agente, y corrígelo si un firmware cambia algo. Empieza por Bambu, con la P1S de Julen. Él prueba cada PR con su impresora; Claude no puede verla.
1. Servidor del agente (hecho, ver arriba).
2. La web detecta el agente, solo cuando la persona lo activa: un sondeo automático a 127.0.0.1 le saltaría un aviso de permisos de Chrome a todo el mundo (hecho, ver arriba).
3. Bambu: estado en vivo por MQTT en el agente y en la pestaña Printers (hecho en #19 y #20; probado por Julen en su P1S el 2026-11-08 con firmware 01.10.00.00 en modo normal: estado en vivo correcto. Resultados en docs/IMPRESORAS.md). Solo lectura, que el firmware permite en modo normal (sin LAN only ni Developer Mode).
4. Registro de trabajos de Bambu (inicio, fin, fallo) en un JSON en disco: la impresora no guarda historial. (Hecho en el PR `feature/agent-job-log`: agent/jobs.js, `GET /jobs`, `PROTOCOL` 3. Falta probarlo con la P1S: checklist en docs/IMPRESORAS.md.)
5. Gramos reales de Bambu: el 3MF por FTPS, leído con `parseSliceInfo` de src/slicerFile.js. Probado el 2026-11-08: FTPS funciona en la P1S en modo normal (sin Developer Mode), así que se construye por FTPS.
6. Driver Moonraker (Klipper): estado e historial, que ya trae (Creality K2/K1 con Moonraker, Elegoo Neptune 4, Qidi, Sovol, Voron). Hecho en el PR `feature/agent-moonraker` (`PROTOCOL` 4); falta probarlo en una impresora real: alguien con una Klipper, checklist en docs/IMPRESORAS.md.
7. Driver PrusaLink.
8. Pestaña Printers: historial, tasa de fallos y tiempo medio. (Hecho en el PR `feature/printers-history`: src/jobStats.js y el panel «Print history». Con datos de la Bambu y de Klipper cuando se prueben.)
9. "Use real data" en la calculadora. (Hecho en el PR `feature/use-real-data`: src/RealData.jsx; solo con el agente activado y con al menos 5 impresiones terminadas. Falta verlo con datos reales de la P1S.)
Modo demo (2026-11-04): `npm run agent -- demo` arranca el agente con dos impresoras simuladas y trabajos de ejemplo (agent/demo.js), para ver todo funcionando sin impresora. No sustituye a la prueba con la P1S.
Creality por WebSocket 9999, Elegoo SDCP, Anycubic, Flashforge y OctoPrint: solo cuando lo pida alguien que pueda probarlo.

## Pendiente, por orden
Plan acordado tras analizar la competencia (MakerQuote, 3DPCC, CraftersQuote): una función cada vez, cada una con su post en Reddit.
1. Probar con cosas reales: un G-code de Cura (solo se probó con muestras del formato), y en el navegador subir un logo y sacar el PDF del presupuesto. La importación de un .gcode.3mf de Bambu Studio la probó Julen con su P1S el 2026-10-22 y va bien.
2. Perfiles de impresoras y materiales predefinidos. (Impresoras: hecho el 2026-11-06 para Bambu Lab, src/printerPresets.js, solo el consumo y con la fuente oficial; faltan otras marcas con cifra publicada y los materiales. Varios filamentos por pieza, cada uno con su precio: hecho el 2026-11-02, `extraFilaments`. Otros costes por pieza o por pedido, como imanes o el diseño: hecho el 2026-11-04, `extraCosts` y capa `extras`.)
3. (Hecho el 2026-11-02: piezas por semana y días del pedido, `capacity` en src/calculate.js, campo `printHoursPerWeek` en «Your setup». Falta enseñárselo a quien lo pidió en Reddit.)
4. Revisar en un móvil de verdad la pantalla del presupuesto (en Chromium a 360 y 390 px ya cabe entera desde #17).
5. Monetizar: el diseño técnico (Polar, webhook con firma, plan comprobado en el servidor) está en docs/NUBE.md, y el código de pago se escribe en su paso (el 7). Qué es de pago y a qué precio va en el documento privado, no en el repositorio. Excel y PDF como "Pro" no se protegen: el código es público y se saltaría en el cliente.

## Ideas futuras, no tocar sin pedirlo
Gráficas, comparativas mes a mes. Inventario de filamento (necesitaría la nube de docs/NUBE.md). Quitar "Quote made with layercents" del presupuesto como función de pago. Cuentas, sincronización de presupuestos y versión de pago ya no son ideas: están en docs/NUBE.md, en orden de PRs.
Recordar también los datos por pieza entre visitas (ahora solo se recuerda "Your setup"; el resto vuelve a los valores por defecto al recargar). Más impresoras en el agente (Klipper/Moonraker, OctoPrint, PrusaLink) cuando Bambu funcione.