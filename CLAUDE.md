# Proyecto: layercents (calculadora de coste de impresión 3D)

Calculadora web del coste real de una pieza impresa en 3D y presupuestos para el cliente. La marca es layercents. React + Vite, desplegada en GitHub Pages con dominio propio: https://layercents.com (comprado en Cloudflare; en su DNS hay 4 registros A a GitHub Pages y un CNAME `www` a llopjulen.github.io, con el proxy de Cloudflare activado, la nube naranja, que es quien pone el candado HTTPS. En Cloudflare tiene que estar activado "Always Use HTTPS", para que nadie use la versión http y se le separen los datos guardados). El archivo public/CNAME le dice a GitHub qué dominio usar: no lo borres. Todo el código y los textos de interfaz están en inglés.

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
  - Acordada el 2026-10-28, diseño en docs/NUBE.md: cuentas, sincronización y flota de impresoras en la nube con Supabase, y cobro con Lemon Squeezy, en PRs por pasos. La calculadora tiene que seguir funcionando sin cuenta. El agente solo abre conexiones salientes a la nube si la persona vincula su cuenta, y nunca sube el código de acceso, el número de serie, la IP ni la huella del certificado de una impresora. Las claves secretas (`service_role` de Supabase, claves y secretos de Lemon Squeezy) no van nunca en el repositorio ni en el chat; la `anon key` y la URL, en `.env.local`.
- Nunca escribas claves, tokens ni emails personales en el código.
- Git usa el email noreply de GitHub; no lo cambies.
- Mantén el estilo actual: oscuro con el oro de la marca (`--oro`), colores definidos como variables en index.css. El logo está en src/Logo.jsx; no uses el verde de Bambu Lab.
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

## Conexión con impresoras: en curso, un PR por paso
Investigación por marca, protocolos, puertos y orden en docs/IMPRESORAS.md: léelo antes de tocar el agente, y corrígelo si un firmware cambia algo. Empieza por Bambu, con la P1S de Julen. Él prueba cada PR con su impresora; Claude no puede verla.
1. Servidor del agente (hecho, ver arriba).
2. La web detecta el agente, solo cuando la persona lo activa: un sondeo automático a 127.0.0.1 le saltaría un aviso de permisos de Chrome a todo el mundo (hecho, ver arriba).
3. Bambu: estado en vivo por MQTT en el agente y en la pestaña Printers (hecho en #19 y #20, falta que Julen lo pruebe con su P1S con la checklist de docs/IMPRESORAS.md). Solo lectura, que el firmware permite en modo normal (sin LAN only ni Developer Mode).
4. Registro de trabajos de Bambu (inicio, fin, fallo) en un JSON en disco: la impresora no guarda historial. (Hecho en el PR `feature/agent-job-log`: agent/jobs.js, `GET /jobs`, `PROTOCOL` 3. Falta probarlo con la P1S: checklist en docs/IMPRESORAS.md.)
5. Gramos reales de Bambu: el 3MF por FTPS, leído con `parseSliceInfo` de src/slicerFile.js. Antes, probar en la P1S si FTPS funciona sin Developer Mode; si no, plan B: arrastrar el 3MF.
6. Driver Moonraker (Klipper): estado e historial, que ya trae (Creality K2/K1 con Moonraker, Elegoo Neptune 4, Qidi, Sovol, Voron).
7. Driver PrusaLink.
8. Pestaña Printers: historial, tasa de fallos y tiempo medio.
9. "Use real data" en la calculadora.
Creality por WebSocket 9999, Elegoo SDCP, Anycubic, Flashforge y OctoPrint: solo cuando lo pida alguien que pueda probarlo.

## Pendiente, por orden
Plan acordado tras analizar la competencia (MakerQuote, 3DPCC, CraftersQuote): una función cada vez, cada una con su post en Reddit.
1. Probar con cosas reales: un G-code de Cura (solo se probó con muestras del formato), y en el navegador subir un logo y sacar el PDF del presupuesto. La importación de un .gcode.3mf de Bambu Studio la probó Julen con su P1S el 2026-10-22 y va bien.
2. Varios filamentos por pieza, cada uno con su precio, y perfiles de impresoras y materiales predefinidos.
3. Mostrar cuántas piezas por semana saca la impresora según el tiempo de impresión (idea de un usuario de Reddit).
4. Revisar en un móvil de verdad la pantalla del presupuesto (en Chromium a 360 y 390 px ya cabe entera desde #17).
5. Monetizar: el diseño técnico (Lemon Squeezy, webhook con firma, plan comprobado en el servidor) está en docs/NUBE.md, y el código de pago se escribe en su paso (el 7). Qué es de pago y a qué precio va en el documento privado, no en el repositorio. Excel y PDF como "Pro" no se protegen: el código es público y se saltaría en el cliente.

## Ideas futuras, no tocar sin pedirlo
Gráficas, comparativas mes a mes. Inventario de filamento (necesitaría la nube de docs/NUBE.md). Quitar "Quote made with layercents" del presupuesto como función de pago. Cuentas, sincronización de presupuestos y versión de pago ya no son ideas: están en docs/NUBE.md, en orden de PRs.
Recordar también los datos por pieza entre visitas (ahora solo se recuerda "Your setup"; el resto vuelve a los valores por defecto al recargar). Más impresoras en el agente (Klipper/Moonraker, OctoPrint, PrusaLink) cuando Bambu funcione.