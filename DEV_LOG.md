# DEV_LOG

Registro de cambios del proyecto. La entrada más nueva va arriba.

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
