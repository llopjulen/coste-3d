# Auditoría técnica de diseño: 2026-10-28

Hecha con `/impeccable audit` sobre el código y sobre la calculadora renderizada a 1280×800 y 390×844 (detector de la skill y contrastes medidos a mano). La auditoría solo documenta; los arreglos van en PRs aparte.

**Estado de los arreglos:** el P1 de contraste está hecho (`--tenue` y `--rojo`, PR #30). El resto está pendiente. La nota de abajo es la de la auditoría, antes de cualquier arreglo.

## Nota: 15/20, buena (hay que trabajar las áreas flojas)

| # | Área | Nota | Lo más importante |
|---|---|---|---|
| 1 | Accesibilidad | 3 | El gris secundario (`--tenue`) sobre las cabeceras de panel da 4,4:1 y el rojo sobre panel 4,1:1. El mínimo de WCAG AA para texto normal es 4,5:1. |
| 2 | Rendimiento | 4 | Nada relevante. |
| 3 | Tokens de color | 3 | Hay 11 tintes de oro escritos como `rgba(242,179,61,…)` y un gris de hover sin variable. |
| 4 | Responsive | 3 | En un portátil de 800 px de alto, el precio se va de la pantalla mientras rellenas los campos de abajo. |
| 5 | Coherencia del sistema | 2 | Hay 33 tamaños de letra distintos, 19 de ellos entre 0,66 y 1 rem. |
| **Total** | | **15/20** | **Buena: hay que trabajar las áreas flojas** |

## Coherencia del sistema: aprobada, con un desvío

El sistema visual es coherente y propio de esta app. La gráfica ¢, el precio protagonista, la hoja de papel que se imprime igual que se ve y el oro reservado para la respuesta no los tiene ninguna otra calculadora.

El desvío está en la tipografía. Hay pasos de 0,02 rem (.86, .88, .89) que a la vista son idénticos. No forman una escala, sino ajustes sueltos que se fueron sumando. Es justo lo que impide el aire «elegante y tranquilo» buscado: la jerarquía se nota por el color y el peso, no por el tamaño.

Hay otro detalle relacionado. `body` está a 15 px, pero los `rem` se calculan sobre los 16 px de la raíz. Por eso `.89rem` acaba siendo 14,24 px y no se corresponde con nada del cuerpo.

## Hallazgos por prioridad

Prioridades: P1 es importante (incumple WCAG AA), P2 es menor y P3 es pulido. No hay ningún P0, es decir, nada que impida terminar una tarea.

### [P1] Contraste del gris secundario sobre el gris elevado: 4,4:1. **Hecho (PR #30)**
- **Dónde:** cabecera de cada panel (`.panel > h2`, 0,76 rem) y textos de ayuda (`.help`), en `src/index.css`.
- **Problema:** se queda justo por debajo del 4,5:1 que pide WCAG 1.4.3, y en letra de unos 12 px, que es donde más se nota.
- **Arreglo:** subir `--tenue` a un gris algo más claro (unos #9A9AA4). Pasa en todos los fondos y casi no cambia el aspecto.
- **Comando:** `/impeccable colorize`
- **Resultado:** `--tenue` pasa de #8E8E98 a #9A9AA4: 5,1:1 sobre `--panel-alto` y 4,8:1 en el peor fondo (el aviso de copia en oro).

### [P1] Rojo de pérdidas con poco contraste. **Hecho (PR #30)**
- **Cifras:** `--rojo` da 4,1:1 sobre el panel y 3,6:1 sobre el gris elevado.
- **Dónde afecta:** la frase del veredicto cuando pierdes dinero (`.loss`, 17,9 px seminegrita), los errores de formulario y la etiqueta «Failed» de impresoras.
- **Por qué cuenta:** es justo el mensaje que no te puedes perder. Esa frase no llega al umbral de «texto grande» (18,66 px en negrita), así que necesita 4,5:1.
- **Arreglo:** un rojo más claro solo para texto, unos #F2696D.
- **Comando:** `/impeccable colorize`
- **Resultado:** `--rojo` pasa de #E5484D a #FF6369 (se cambió la variable en vez de crear un rojo aparte): 4,9:1 sobre `--panel-alto` y 4,5:1 en la insignia «Failed».

### [P2] Escala tipográfica fragmentada. Pendiente
- **Cifras:** 33 tamaños distintos y 63 avisos del detector sobre tamaños sin rol definido.
- **Arreglo:** reducirlo a unos 6 o 7 pasos con variables (`--t-xs` … `--t-display`) y ajustar el cuerpo para que rem y cuerpo encajen.
- **Comando:** `/impeccable typeset`

### [P2] Letra por debajo de 12 px. Pendiente
- **Dónde:** contador de la pestaña y etiqueta Beta (0,7 rem, 11,2 px), cabeceras de tabla (0,72 rem), títulos de grupo de «Your setup» (0,74 rem) y la pista de los KPI del informe (0,68 rem).
- **Problema:** en una pantalla de taller a cierta distancia cuesta leerla.
- **Comando:** `/impeccable typeset`

### [P2] El precio desaparece en portátiles. Pendiente
- **Dónde:** `.result` en `src/index.css`. Solo se queda fijo arriba si la ventana mide más de 880 px de alto.
- **Problema:** a 800 px la columna de campos ocupa el 171 % de la pantalla, así que al editar la luz o el embalaje no ves cómo cambia el precio. Y la idea de la app es ver la respuesta mientras tocas los números.
- **Arreglo:** dejar fijo solo el bloque del precio y la gráfica, y que el formulario de guardar fluya debajo.
- **Comando:** `/impeccable layout`

### [P2] Bordes de los campos casi invisibles. Pendiente
- **Cifras:** `--borde` da 1,5:1 contra el fondo del campo y 1,3:1 contra el panel. WCAG 1.4.11 pide 3:1 en los bordes de controles.
- **Matiz:** el campo se distingue algo por su fondo más hundido, pero poco. Además encaja con el «cálido y táctil» buscado: campos con más presencia.
- **Comando:** `/impeccable polish`

### [P2] Colores sueltos sin variable. Pendiente
- **Dónde:** 11 tintes de oro en `rgba(242,179,61,…)`, `#4A4A53` dos veces y un tinte de rojo.
- **Problema:** si cambias `--oro`, los halos, los avisos y la fila marcada en History se quedan con el oro viejo.
- **Arreglo:** usar `color-mix(in oklch, var(--oro) 15%, transparent)` o variables `--oro-tinte-*`.
- **Comando:** `/impeccable polish`

### [P3] Falta el punto de referencia `<main>`. Pendiente
- **Dónde:** `src/App.jsx`. La barra de arriba es un `<div>` y el contenido no está dentro de `<main>`. El `<main>` estático de `index.html` desaparece al montarse React.
- **Problema:** quien navega con lector de pantalla no puede saltar directo al contenido.
- **Comando:** `/impeccable harden`

### [P3] Botón de ayuda (i) pequeño. Pendiente
- **Cifras:** mide 17 px. Cumple el 2.5.8 de WCAG por la separación que tiene alrededor, pero en el móvil cuesta acertarle.
- **Comando:** `/impeccable adapt`

## Lo que el detector marcó y no es un fallo

- **«Card inside card»:** la zona de soltar archivo y las tarjetas de impresora son huecos hundidos dentro de un panel, una decisión documentada en DESIGN.md. Es intencionado.
- **Borde de color a la izquierda en las ayudas:** también está documentado como patrón del sistema.
- **«Inter está demasiado vista»:** es una opinión de diseño, no un defecto técnico. Si se quiere más personalidad, se valora en `/impeccable typeset`.
- **Calibri en `exportExcel.js`:** es la letra del Excel que se descarga, no de la web. Está bien.

## Lo que está bien hecho

- **Accesibilidad:** está cuidada de verdad, mejor que en la mayoría de herramientas parecidas.
  - Cada campo tiene su `label` o `aria-label`, y los botones de ayuda llevan `aria-expanded` y `aria-controls`.
  - Hay zonas `role="status"` y `role="alert"` donde toca, y las tarjetas de impresora se dejaron fuera a propósito para que el lector de pantalla no hable cada 3 s.
  - La barra de progreso es un `progressbar` con su valor, y el estado de las impresoras nunca se indica solo con color.
  - El foco solo se ve con teclado (`:focus-visible`), y quien pide menos movimiento en el sistema no ve animaciones.
- **Rendimiento:**
  - Excel y fflate solo se cargan cuando se usan.
  - Las impresoras solo se consultan con la pestaña visible.
  - Las fuentes van con `preconnect` y `display=swap`, y solo se animan `transform`, `width` y `x`.
- **Móvil:** no hay scroll horizontal a 390 px. Las tablas esconden columnas en vez de desbordarse y la barra de abajo se aparta cuando ya ves el resultado.
- **Impresión:** el informe y el presupuesto se imprimen limpios, en A4 y sin fondo negro.

## Orden recomendado

1. ~~**[P1] `/impeccable colorize`:** aclarar `--tenue` y crear un rojo para texto. Son dos líneas en `:root` y cierran los dos fallos de WCAG.~~ **Hecho (PR #30).**
2. **[P2] `/impeccable typeset`:** escala tipográfica de 6 o 7 pasos y nada por debajo de 12 px. Es el cambio que más acerca la app a «elegante y tranquila». Pendiente.
3. **[P2] `/impeccable layout`:** precio siempre a la vista en portátiles. Pendiente.
4. **[P2] `/impeccable polish`:** variables para los tintes de oro y bordes de campo con más presencia. Pendiente.
5. **[P3] `/impeccable harden`:** añadir `<main>` y `<header>`. Pendiente.

Después de cada arreglo, volver a ejecutar `/impeccable audit` para ver cómo sube la nota.
