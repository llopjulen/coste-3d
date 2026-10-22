# DEV_LOG

Registro de cambios del proyecto. La entrada más nueva va arriba.

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
