---
version: 1
name: layercents
description: >-
  Herramienta de trabajo para talleres de impresión 3D, sobria como los
  Ajustes de iOS: listas agrupadas sobre un fondo un escalón más oscuro,
  Inter para todo, separadores finos y un único color de marca (oro) que
  solo marca el precio, la acción principal y dónde estás. Dos temas
  (oscuro grafito y claro) con los mismos tokens.

colors:
  # Oscuro (por defecto). Los nombres son las variables CSS de src/index.css.
  fondo: "#111113"        # el lienzo
  panel: "#1C1C1F"        # grupos y bloques
  panel-alto: "#2A2A2E"   # botones secundarios, fila pulsada
  hundido: "#26262A"      # un campo mientras se edita
  borde: "#2C2C30"        # separadores entre filas
  borde-fuerte: "#48484E"
  texto: "#F2F2F0"
  tenue: "#9C9CA2"        # 6,6:1 sobre panel
  oro: "#E3AE4F"          # la marca
  oro-texto: "#EDC074"    # oro para letras (en claro: #8A5A00, 5,9:1)
  rojo: "#FF7B72"         # pérdidas, tarde, borrar
  claro:
    fondo: "#F2F2F4"
    panel: "#FFFFFF"
    panel-alto: "#EBEBEE"
    borde: "#E3E3E7"
    texto: "#1D1D1F"
    tenue: "#6E6E73"
    oro-texto: "#8A5A00"
    rojo: "#C62F2A"
  papel:              # el presupuesto y el informe impresos (PDF): siempre claros
    papel: "#FFFFFF"
    tinta: "#1B1B1F"
    tinta-suave: "#5E5E68"
    acento: "elegido por el taller (business.accent); el texto encima, por contraste WCAG (src/quoteStyle.js)"
  capas-del-coste:    # la barra apilada del coste, en src/App.jsx (LAYERS): tonos apagados
    material: "#E3AE4F"
    electricidad: "#7EA89F"
    amortizacion: "#8A9CB8"
    fallos: "#B48A9C"
    mano-de-obra: "#AAA59A"
    embalaje: "#77756F"
    otros: "#9AA27A"

typography:
  family: "Inter Variable"          # todo
  brand-family: "Bricolage Grotesque Variable"   # solo la palabra «layercents»
  body: { size: 15px, lineHeight: 1.47, letterSpacing: -0.006em }
  input-touch: { size: 16px }       # en pantallas táctiles, para que iOS no haga zoom
  h1: { size: "clamp(1.9rem, 4.6vw, 2.6rem)", weight: 700, letterSpacing: -0.032em, lineHeight: 1.08 }
  group-title: { size: 0.84rem, weight: 500, color: tenue }
  row: { size: 0.95rem }
  stat: { size: 1.35rem, weight: 500, letterSpacing: -0.025em }
  price: { family: Inter, weight: 700, color: oro }
  numbers: "font-variant-numeric: tabular-nums en toda cifra que se compare"

rounded:
  group: 14px     # --radio
  control: 9px    # --radio-campo: botones, campos
  small: 8px      # pastillas internas, filas pulsables
  pill: 999px     # estados

spacing:
  row-height: 48px     # una fila de lista
  group-padding-x: 16px
  page: { max-width: 1080px, padding: "44px 24px 72px", mobile: "24px 16px 64px" }
  gaps: [6, 8, 12, 16, 22, 28]

breakpoints:
  phone: 600px      # una columna, barra de precio fija abajo
  tablet: 860px     # sin barra lateral: pestañas arriba
  desktop: 1440px
---

# DESIGN.md de layercents

Este archivo dice **cómo tiene que verse** layercents (versión del 2026-11-06; sustituye a la del 16 de octubre, que describía el estilo anterior al rediseño del 3 de noviembre), para que cualquier persona o IA que toque la interfaz la mantenga coherente. El formato es el de [DESIGN.md](https://stitch.withgoogle.com/docs/design-md/overview/): tokens arriba y reglas en prosa abajo. Los valores reales viven en `src/index.css`; si cambias uno allí, cámbialo aquí.

Antes de dar por bueno un cambio visual: `npm run build && npm run shots`, y mira las capturas de `shots/` a 1440, 1024, 768 y 390 px, en claro y en oscuro.

## La idea

Una herramienta, no un folleto. Quien la abre viene a calcular un precio o a mover un pedido: la pantalla va directa al trabajo, con la información ordenada en listas como los Ajustes de iOS. Lo que hace que se vea profesional no es la decoración, sino:
- **Jerarquía:** el precio manda; lo demás, en orden.
- **Alineación:** cifras en columna, con `tabular-nums`.
- **Consistencia:** una sola forma de hacer cada cosa.

## Color

- **Oro = marca y atención.** Solo para el precio recomendado, el botón principal de cada pantalla y marcar dónde estás (la pestaña activa, el día de hoy). Si hay dos cosas doradas en una pantalla, una sobra. Los enlaces, las acciones de «+ Añadir…» y los mensajes de «Guardado» van en color de texto.
- **Grises por capas, no por bordes.** Un grupo se distingue del fondo por ser un escalón más claro (`panel` sobre `fondo`), sin borde alrededor. Dentro del grupo, separadores de 1 px (`borde`).
- **Rojo** solo para pérdidas, «va tarde» y acciones que borran.
- Los estados de un pedido llevan un punto de color apagado **y** la palabra: el color nunca es la única pista (WCAG 1.4.1).
- Contraste mínimo de 4,5:1 para todo texto, medido en los dos temas (los valores están comentados en `index.css`).

- **El papel es otro mundo:** el presupuesto para el cliente y el informe se imprimen siempre en blanco con tinta oscura, aunque la app esté en oscuro (`@media print` fuerza `color-scheme: light`). El color del presupuesto lo elige cada taller.
- **La barra del coste** usa siete tonos apagados del mismo brillo, para que ninguna capa grite salvo el material, que es oro porque es lo que más mira la gente.

## Tipografía

- Inter para todo. Bricolage solo en el nombre de la marca.
- Texto a 15 px. En pantallas táctiles, los campos a 16 px: Safari en iPhone hace zoom al tocar un campo más pequeño.
- Toda cifra que se compare (importes, porcentajes, horas) va con `tabular-nums`, para que los dígitos tengan el mismo ancho y las columnas cuadren.
- Títulos con `text-wrap: balance`, para que no se quede una palabra sola en la última línea.
- Puntos suspensivos de verdad: «Guardando…», no «Guardando...».

## Componentes

- **Lista agrupada:** un título pequeño y gris fuera del grupo, y dentro filas de 48 px con el nombre a la izquierda y el valor a la derecha, sin caja alrededor del valor. Es la pieza base de toda la app.
- **Ayuda de un campo:** sale debajo de la fila mientras el campo tiene el foco, en texto pequeño y gris, sin caja. Nada de iconos «ⓘ» tras cada etiqueta. Va unida al campo con `aria-describedby`.
- **Título de pantalla (h1):** 1,75 rem, peso 650, una línea de subtítulo gris. Escala de app, no de landing.
- **Importar archivo:** una fila más de la lista (título y pista a la izquierda, botón a la derecha). Nada de cajas de borde discontinuo.
- **Botón principal:** fondo oro, texto `sobre-oro`, uno por pantalla. Los secundarios, en `panel-alto`.
- **Control segmentado:** para elegir entre 2 y 5 opciones que se ven a la vez (filtros, estado de un pedido). Con `aria-pressed`.
- **Hoja (`<dialog>` nativo):** para crear o editar algo sin salir de la pantalla. Trampa de foco y Esc los da el navegador.
- **Pastilla de estado:** un punto y la palabra, 0,74 rem, redondeo completo.
- **Cifras resumen (`.stat`):** de 2 a 4 en fila arriba de una lista; en el móvil, en dos columnas.

## Interacción

- **Foco visible** con el teclado en todo lo pulsable (`:focus-visible`, anillo oro suave). Nunca `outline: none` sin otro indicador.
- **La pantalla abierta va en la URL** (`?view=orders&order=…`, src/route.js): recargar, compartir un enlace o pulsar Atrás funcionan.
- **Escritura optimista:** el cambio se ve al momento; si falla al guardar, se avisa y se vuelve a lo guardado.
- **Borrar pide confirmación;** en los pedidos, se recomienda cancelar en vez de borrar.
- **Los campos guardan al salir** (blur o Enter), no en cada tecla.
- Animaciones cortas, solo en `transform` y `opacity`, y desactivadas con `prefers-reduced-motion`.

## Sí

- Ir directo al trabajo: la primera pantalla es la herramienta.
- Datos reales en ejemplos y capturas (piezas, precios, clientes plausibles).
- Una acción principal por pantalla.
- Probar cada cambio en 390 px antes que en escritorio.

## No

- Degradados, brillos, neón, sombras grandes o cristal: se leen como plantilla.
- Tarjetas con borde dentro de tarjetas con borde.
- El oro en más de una cosa a la vez, o para decorar.
- Iconos decorativos que no ayudan a encontrar nada.
- Un titular de landing con subtítulo gris encima de cada herramienta.
- Emojis en la interfaz.
- El verde de Bambu Lab, ni los colores o la tipografía de otra marca conocida.

## Responsive

- **Menos de 860 px:** la barra lateral pasa a pestañas arriba, que se desplazan en horizontal. Un fundido marca el lado donde quedan pestañas fuera (solo si de verdad quedan), y la pestaña abierta siempre está a la vista.
- **Menos de 600 px:** todo a una columna. La calculadora lleva una barra fija abajo con el precio y el coste (con `safe-area-inset-bottom` para el iPhone). Las tablas pasan a listas de dos líneas.
- **Objetivos táctiles** de al menos 44 px de alto en el móvil.
