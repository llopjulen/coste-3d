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
Hecho: desglose de costes con gráfica por capas, precio recomendado, toggle "Show cost only", selector de moneda con tipos de cambio en vivo (api.frankfurter.dev/v1), botón Save quote con lista guardada en localStorage, README.
No publicado todavía en la web: Save quote.

## Pendiente, por orden
1. Lista de presupuestos guardados: mostrar la fecha, botón de borrar por fila (deleteQuote con .filter) y mejorar el aspecto de la lista.
2. Botón "Export CSV" con los presupuestos guardados.
3. Mostrar cuántas piezas por semana saca la impresora según el tiempo de impresión (idea de un usuario de Reddit).
4. Revisar que todo se vea bien en móvil.

## Ideas futuras, no tocar sin pedirlo
Gráficas, comparativas mes a mes, cuentas de usuario, versión de pago.