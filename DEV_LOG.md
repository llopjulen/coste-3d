# DEV_LOG

Registro de cambios del proyecto. La entrada más nueva va arriba.

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
