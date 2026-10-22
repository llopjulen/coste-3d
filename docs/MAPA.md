# Mapa del código de layercents

Para orientarse antes de leer un archivo: qué hace cada pieza, cómo viajan los datos, qué se guarda y dónde tocar para cada cambio. Se actualiza en cada PR que añada archivos, claves de localStorage o cambie el flujo de datos.

## La arquitectura en un párrafo

Es una SPA (single-page application) de React 19 compilada con Vite 8, sin backend: todo se ejecuta en el navegador y los datos persisten en `localStorage`. Un único componente raíz, `App`, tiene el estado y decide qué pantalla se ve. El resto de componentes son casi todos presentacionales: reciben datos por props y avisan hacia arriba con callbacks (`onLoad`, `onDelete`…). Es flujo de datos unidireccional: los datos bajan, los eventos suben. La única excepción son los datos del negocio y el contador de presupuestos, que `CustomerQuote` lee y escribe directamente en `localStorage`.

## Orden recomendado de lectura

1. `src/main.jsx` (10 líneas): cómo arranca React.
2. `src/App.jsx`, secciones 1 y 2: la definición de los campos (`SECTIONS`) y `calculate()`. Es el corazón del producto y no tiene nada de React.
3. `src/App.jsx`, sección 4: el estado y cómo se elige la pantalla.
4. `src/History.jsx`: el componente más típico (props entrantes, callbacks salientes, estado local solo para la UI).
5. `src/slicerFile.js`: parsing con expresiones regulares; independiente de React.
6. El resto según lo que vayas a tocar.

## Archivos

| Archivo | Qué hace |
|---|---|
| `index.html` | El shell: metadatos para buscadores y para compartir (Open Graph), fuentes de Google, Cloudflare Web Analytics y el `<div id="root">` donde React pinta todo. |
| `src/main.jsx` | Punto de entrada. Importa `index.css` y monta `<App>` dentro de `<StrictMode>`. En desarrollo, StrictMode ejecuta dos veces renders y efectos para destapar efectos secundarios mal hechos; en producción no hace nada. |
| `src/App.jsx` | Estado global, cálculo y navegación. Cuatro secciones: 1) campos (`SECTIONS`, `INITIAL`) y colores de las capas (`LAYERS`); 2) `calculate(d)`; 3) componentes pequeños (`Field`, `SiteFooter`); 4) `App`. |
| `src/History.jsx` | Lista de presupuestos: tarjetas resumen, buscador, tabla agrupada por mes, marcar piezas para el presupuesto de cliente, Load y borrar. No es dueño de ningún dato. |
| `src/Report.jsx` | Informe imprimible (KPIs y 3 gráficas hechas con `div` y porcentajes, sin librería de gráficas). El PDF sale de `window.print()`. |
| `src/CustomerQuote.jsx` | Presupuesto para el cliente: formulario arriba, hoja abajo. Lee y escribe `business` y `quoteCounter`. Calcula en céntimos enteros. |
| `src/ImportFile.jsx` | Panel "Import from your slicer": arrastrar y soltar en toda la página, elegir bandeja y número de piezas, Undo. |
| `src/slicerFile.js` | Parser de `.gcode`, `.bgcode` y `.gcode.3mf`. Funciones puras (`parseSlicerText`, `parseSliceInfo`, `formValuesFromPlates`) más la lectura del `File` (`readSlicedFile`). |
| `src/exportExcel.js` | Export `.xlsx` con formato y fórmulas `SUM`. Se carga solo al pulsar el botón. |
| `src/backup.js` | Copia de seguridad: funciones puras (construir, validar, fusionar, planificar, recordatorio) y capa de almacenamiento (`writeAtomically`, `applyRestore`, `downloadBackup`). |
| `src/BackupPanel.jsx` | Panel "Backup" al final de History y aviso `BackupReminder` encima. |
| `src/Logo.jsx` | El logo en SVG; los colores salen del CSS. |
| `src/index.css` | Todos los estilos. Arriba los tokens (`--fondo`, `--oro`…) en `:root`; luego una sección por pantalla, con comentarios en español. `@media print` decide qué sale en los PDF. |
| `public/` | Se copia tal cual a la web: `CNAME` (el dominio para GitHub Pages: no se borra), iconos e imagen para compartir. |
| `screenshots/` | Capturas del README. |
| `docs/MAPA.md` | Este archivo. |
| `CLAUDE.md`, `DEV_LOG.md` | Instrucciones del proyecto y registro de cada cambio con su porqué. |

Restos de la plantilla de Vite que nada usa y se pueden borrar: `src/assets/` (hero.png, react.svg, vite.svg) y `public/icons.svg`.

## Flujo de datos

```
                 ┌──────────────────── App ─────────────────────┐
  Field ─onChange─► set(key) ─► d (valores del formulario)       │
  ImportFile ─onApply─► applyImport ─► d                        │
                 │   d ──► calculate(d) ──► r (se recalcula en  │
                 │                            cada render)      │
                 │   saveQuote: {…d, …r} ──► savedQuotes ──► useEffect ──► localStorage
                 │   view decide la pantalla:                   │
                 │     calculator │ history │ report │ quote    │
                 └───────┬──────────────┬───────────┬───────────┘
                         ▼              ▼           ▼
             History (quotes,      Report       CustomerQuote ◄──► localStorage
             onLoad, onDelete,     (quotes)     (quotes marcados)   business,
             onExport, onReport,                                    quoteCounter
             onCustomerQuote)
             BackupPanel / BackupReminder ──► backup.js ◄──► localStorage
```

- `r` es estado derivado: no se guarda en `useState`, se recalcula con `calculate(d)` en cada render. Calcular es barato, y así nunca puede quedar desincronizado de `d`.
- `savedQuotes` se escribe en `localStorage` desde un `useEffect` con `[savedQuotes]` como dependencias: se ejecuta después de cada render en el que la lista cambió.
- `view` sustituye a un router: no hay una URL por pantalla. Por eso recargar la página vuelve siempre a la calculadora y el botón Atrás del navegador no cambia de pantalla.

## Dinero y monedas

Todo se guarda en EUR. Al arrancar, `App` pide los tipos de cambio a `api.frankfurter.dev/v1` (datos del BCE) y los guarda en `rates`. `formatMoney` multiplica por `rates[currency]` solo al pintar. Si la API no responde, `rates` se queda en `{ EUR: 1 }` y la app funciona en euros. `CustomerQuote` convierte a céntimos enteros de la moneda en pantalla antes de sumar, para que las líneas sumen exactamente el total (con decimales binarios, `0.1 + 0.2 !== 0.3`).

## Qué se guarda en localStorage

| Clave | Contenido | La escribe | La lee |
|---|---|---|---|
| `savedQuotes` | Array de presupuestos (forma abajo) | `App` (efecto tras cada cambio) y `applyRestore` | `App` al arrancar |
| `business` | `{ name, contact, logo, notes, tax, validDays }`; `logo` es un data URL PNG de 480 × 200 px como mucho | `CustomerQuote.saveBusiness`, `applyRestore` | `CustomerQuote` al abrirse |
| `quoteCounter` | Entero: el siguiente número de presupuesto (2026-007) | `CustomerQuote.savePdf`, `applyRestore` (nunca lo baja) | `CustomerQuote` |
| `lastBackupAt` | Fecha ISO de la última copia en este dispositivo; no va dentro de la copia | `downloadBackup`, `applyRestore` | `App` |

Forma de un presupuesto guardado:

```js
{
  id: 1791013259422,            // Date.now() al guardar: clave de React, id para borrar y fecha de respaldo
  createdAt: '2026-10-03T…Z',   // fecha ISO
  date: '3/10/2026',            // texto antiguo, ya no se usa para pintar
  name: 'Phone stand', client: 'Ana',
  inputs: { spoolPrice: 20, … },  // copia de d: lo que "Load" vuelve a poner en el formulario
  parts: { material: 0.9, … },    // las seis capas del coste
  cost: 5.22, price: 7.94, units: 1, orderTotal: 7.94,
}
```

Los presupuestos de la primera versión solo tienen `{ id, date, cost, price }`. Por eso el código usa `q.createdAt ?? q.id` para la fecha y `q.orderTotal ?? q.price` para el total, y "Load" está desactivado cuando falta `inputs`.

Los valores del formulario (`d`) no se guardan: al recargar vuelven a `INITIAL`.

## El cálculo: `calculate(d)`

Función pura en `src/App.jsx`: entran los valores del formulario y salen números, sin tocar React ni la pantalla.

- `material = (partGrams + purgeGrams) × spoolPrice / spoolWeight`
- `power = watts / 1000 × hours × kwhPrice` (kWh × precio)
- `depreciation = hours × printerPrice / lifespan` (amortización lineal por hora de uso)
- `failures = (material + power + depreciation) × failRate / 100`
- `labor = postMinutes / 60 × hourlyRate`, más `packaging`
- `cost` = la suma de las seis capas
- `recommendedPrice = cost × (1 + margin) / (1 − fee)`: la comisión de la plataforma se cobra sobre el precio final, así que se divide entre `(1 − fee)` en vez de multiplicar por `(1 + fee)`.
- `profit = currentPrice × (1 − fee) − cost` y `perHour = profit / hours`.

Simplificación a tener en cuenta: con una tasa de fallos `p`, el coste esperado por pieza buena es `base / (1 − p)` (hacen falta de media `1 / (1 − p)` intentos), no `base × (1 + p)`. Con el 8 % la diferencia es pequeña (8,7 % frente a 8 %); con el 30 % ya no (42,9 % frente a 30 %). Como los fallos suelen pararse a medias, `base × p` puede servir como estimación, pero conviene decidirlo a propósito.

## Patrones que se repiten

- **Inmutabilidad.** `{ ...obj }`, `[...arr]`, `arr.filter()`, `new Set(prev)`: siempre un objeto nuevo, nunca mutar el viejo, porque React detecta cambios comparando referencias (`Object.is`) y no contenidos.
- **Estado inicial perezoso.** `useState(() => leer())`: la función solo se ejecuta en el primer render. Se usa para leer `localStorage` una vez y no en cada render.
- **Componentes controlados y no controlados.** Los inputs de `Field` son controlados (`value` + `onChange`). Los precios de `CustomerQuote` son no controlados (`defaultValue`) con una `key` que cambia con la moneda para rehacerlos; así el cursor no salta al escribir.
- **Carga diferida.** `await import('./exportExcel.js')` y `await import('fflate')`: Vite los separa en otros archivos (code splitting) que solo se descargan cuando hacen falta, y la carga inicial es más ligera.
- **PDF sin librería.** `window.print()` más `@media print` y la clase `.no-print`.
- **`localStorage` siempre dentro de `try/catch`.** Lanza excepciones si está bloqueado (modo privado) o lleno (`QuotaExceededError`).
- **`useRef` para listeners globales.** `ImportFile` registra `dragover` y `drop` en `window` una sola vez y llega a la `handleFile` más reciente a través de una ref, para que el listener no use una versión antigua de la función (stale closure).
- **Errores para la persona y errores de programa.** `ImportError` y `BackupError` llevan un mensaje que se enseña tal cual; cualquier otro error es un bug y va a la consola.

## Dónde tocar para…

| Quiero… | Dónde |
|---|---|
| Añadir o cambiar un campo del formulario, su ayuda o su valor por defecto | `SECTIONS` en `App.jsx` (y `calculate` si interviene en el coste) |
| Cambiar una fórmula | `calculate` en `App.jsx` |
| Cambiar colores o espaciado | tokens de `:root` en `index.css` |
| Soportar otro laminador | `parseSlicerText` en `slicerFile.js` |
| Añadir una columna al Excel | `buildColumns` en `exportExcel.js` |
| Cambiar la hoja del presupuesto | el `<article className="report quote-doc">` de `CustomerQuote.jsx` |
| Guardar algo nuevo en el navegador | la clave en su componente **y** en `backup.js` (copia y validación) |
| Cambiar el formato de la copia | subir `BACKUP_SCHEMA_VERSION` y añadir la migración en `MIGRATIONS` |

## Comandos y publicación

- `npm run dev`: servidor de desarrollo con recarga en caliente (HMR) en `localhost:5173`.
- `npm run build`: compila a `dist/` (JS minificado y separado en trozos).
- `npm run lint`: oxlint, con las reglas de hooks de React.
- `npm run deploy`: `gh-pages` publica `dist/` en la rama `gh-pages`. GitHub Pages sirve esa rama y `public/CNAME` le dice el dominio; Cloudflare va delante y pone el HTTPS.
