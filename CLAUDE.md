# Proyecto: 3D Print Cost Calculator

Calculadora web del coste real de una pieza impresa en 3D. React + Vite, desplegada en GitHub Pages (https://llopjulen.github.io/coste-3d/). Todo el código y los textos de interfaz están en inglés.

## Sobre el dueño
Julen, 21 años, estudia Ingeniería Informática a distancia y trabaja a jornada completa. Tiene poco tiempo y quiere entender lo que hace el proyecto aunque no lo escriba él. Todo lo que explique tiene que estar en español, en lenguaje de principiante: qué se hizo y por qué.

## Regla principal: registro de cambios
Después de CADA cambio en el código, añade una entrada al principio de DEV_LOG.md con este formato:

### AAAA-MM-DD, título corto
- Archivo y sitio: ruta del archivo y zona (por ejemplo "src/App.jsx, dentro de la función App, junto a saveQuote")
- Qué cambió: una o dos frases
- Por qué: el motivo, en lenguaje de principiante
- Concepto nuevo: si usa algo que Julen no ha visto (por ejemplo .filter, Blob), explícalo en 2-3 líneas con un ejemplo mínimo
- Cómo probarlo: pasos concretos para ver que funciona

No hagas ningún cambio sin dejar su entrada.

## Reglas de trabajo
- Cambios pequeños, uno por tarea, y un commit por cada uno con mensaje claro en inglés.
- Antes de dar algo por terminado, ejecuta `npm run build`. Si falla, arréglalo.
- NO ejecutes `npm run deploy` ni `git push` sin que Julen lo pida expresamente. Al acabar cada tarea, dile que está listo para publicar.
- No añadas dependencias nuevas sin explicar por qué hacen falta.
- No metas backend, cuentas de usuario ni bases de datos. La app guarda datos en localStorage y así se queda por ahora.
- Nunca escribas claves, tokens ni emails personales en el código.
- Git usa el email noreply de GitHub; no lo cambies.
- Mantén el estilo actual: oscuro, estilo Bambu Studio, colores definidos como variables en index.css.
- Si una petición es ambigua o crece demasiado, para y pregunta antes de construir.

## Estado actual
Hecho: desglose de costes con gráfica por capas, precio recomendado, toggle "Show cost only", selector de moneda con tipos de cambio en vivo (api.frankfurter.dev/v1, ahora en la barra superior), README.
Hecho el 2026-10-14 (ver DEV_LOG.md):
- Guardar presupuesto con nombre de pieza, cliente y copia completa de datos y desglose (en localStorage, clave `savedQuotes`).
- Pestaña History (src/History.jsx): tarjetas resumen, buscador, tabla agrupada por mes, "Load" para volver a cargar un presupuesto y borrar con confirmación.
- Export Excel .xlsx con formato (src/exportExcel.js, librería write-excel-file, cargada solo al pulsar). Sustituye al CSV.
- PDF report (src/Report.jsx): informe imprimible con 5 cifras clave, 3 gráficas y tabla. Se guarda con "Guardar como PDF" del navegador.
Hecho el 2026-10-15 (ver DEV_LOG.md):
- Importar del laminador (src/slicerFile.js y src/ImportFile.jsx): soltar un .gcode, .bgcode o .gcode.3mf rellena tiempo, gramos y purga, con piezas por bandeja, elección de bandeja y Undo. Usa fflate, cargada solo al soltar un 3MF.
No publicado todavía en la web (sin deploy): todo lo anterior desde Save quote.

## Pendiente, por orden
Plan acordado tras analizar la competencia (MakerQuote, 3DPCC, CraftersQuote): una función cada vez, cada una con su post en Reddit.
1. Probar la importación con un .gcode.3mf real de Bambu Studio y un G-code de Cura (solo se probó con archivos reales de PrusaSlicer y con muestras del formato de los demás).
2. Presupuesto para el cliente: varias piezas distintas en un pedido y PDF con logo para mandárselo.
3. Varios filamentos por pieza, cada uno con su precio, y perfiles de impresoras y materiales predefinidos.
4. Mostrar cuántas piezas por semana saca la impresora según el tiempo de impresión (idea de un usuario de Reddit).
5. Revisar que todo se vea bien en móvil (History y el informe ya se revisaron; falta repasar la calculadora con calma).
6. Pensar cómo monetizar (por ejemplo, Excel y PDF como "Pro"). Solo hablarlo; no tocar código de pagos sin pedirlo.

## Ideas futuras, no tocar sin pedirlo
Gráficas, comparativas mes a mes, cuentas de usuario, versión de pago. Sincronizar presupuestos entre móvil y PC e inventario de filamento (serían "Pro" y necesitan backend: pedirlo antes).