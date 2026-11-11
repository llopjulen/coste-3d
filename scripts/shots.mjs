/* ==================================================================
   SHOTS — fotografía la web a 4 anchos × 2 temas, para ver un cambio
   de diseño en todas las pantallas a la vez.

   Uso:   npm run build && npm run shots              (todas las vistas)
          npm run shots -- calculator history         (solo esas)
          SHOTS_DIR=antes npm run shots               (a otra carpeta, para comparar)
   Salen en shots/<vista>-<ancho>-<tema>.png (carpeta ignorada por git).

   Vistas (2026-11-11, antes solo las cinco primeras): calculator, history,
   orders, calendar, plans, y además:
     fold           la calculadora SIN scroll: lo que se ve al abrir la web
     order          el detalle de un pedido (se crea desde el Historial)
     quote, report  el presupuesto del cliente y el informe
     printers       con el agente en modo demo (el script lo arranca)
     empty-history, empty-orders   sin ningún dato guardado

   Por qué estos anchos: 1440 (portátil grande), 1024 (portátil pequeño /
   iPad horizontal), 768 (iPad vertical) y 390 (iPhone). Son los que usa
   Taste Skill para comprobar sus páginas; entre ellos cae casi todo lo
   que se rompe (barra lateral que no cabe, tablas que desbordan...).

   Puerto 4173 y no otro: el agente solo acepta peticiones de los orígenes
   de su lista (agent/handler.js, ALLOWED_ORIGINS), y de los locales están
   5173 (npm run dev) y 4173 (npm run preview).

   Navegador: playwright-core NO trae navegador, usa el Chrome que ya
   tienes instalado (`channel: 'chrome'`). En otro sitio (un servidor sin
   Chrome) se le pasa la ruta: CHROME_PATH=/ruta/a/chrome npm run shots.
================================================================== */
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const WIDTHS = [[1440, 900], [1024, 768], [768, 1024], [390, 844]]
const THEMES = ['dark', 'light']
const PORT = 4173
const OUT = process.env.SHOTS_DIR || 'shots'
const BASE = `http://localhost:${PORT}/es/`
// Datos de ejemplo, para que Historial y Pedidos no salgan vacíos. El id es
// la fecha en milisegundos (History la usa como fecha): noviembre de 2026.
const SAMPLE_QUOTES = [
  { id: 1793613600001, name: 'Llavero logo', client: 'Bar Pepe', price: 2.5, cost: 1.2, units: 25, date: '2026-11-02T10:00:00Z', inputs: { hours: 0.5, failRate: 8 } },
  { id: 1793700000002, name: 'Soporte de móvil', client: 'Laura G.', price: 7.94, cost: 5.22, units: 2, date: '2026-11-03T10:00:00Z', inputs: { hours: 3.5, failRate: 8 } },
  { id: 1793180000003, name: 'Maceta autorriego', client: '', price: 14.6, cost: 8.9, units: 1, date: '2026-10-28T10:00:00Z', inputs: { hours: 6, failRate: 8 } },
]

const tab = name => async page => { await page.goto(BASE); await page.waitForTimeout(400); await page.locator('.tab', { hasText: name }).first().click() }
const tickAll = async page => { await page.goto(`${BASE}?view=history`); await page.waitForTimeout(400); await page.locator('tbody input[type="checkbox"]').first().check(); for (const box of await page.locator('tbody input[type="checkbox"]').all()) await box.check() }
// Cada vista: cómo llegar a ella. `full: false` = solo lo que cabe en la
// ventana; `empty` = sin datos de ejemplo.
const VIEWS = {
  calculator: { go: async page => { await page.goto(BASE); await page.waitForTimeout(2200) } },
  fold: { full: false, go: async page => { await page.goto(BASE); await page.waitForTimeout(2200) } },
  history: { go: tab('Historial') },
  orders: { go: tab('Pedidos') },
  calendar: { go: tab('Calendario') },
  plans: { go: tab('Planes') },
  quote: { go: async page => { await tickAll(page); await page.getByRole('button', { name: /Presupuesto para el cliente/ }).click() } },
  report: { go: async page => { await page.goto(`${BASE}?view=history`); await page.waitForTimeout(400); await page.getByRole('button', { name: /Informe/ }).click() } },
  // Va después de las demás: crea un pedido, que se queda guardado en este contexto.
  order: { go: async page => {
    await tickAll(page)
    await page.getByRole('button', { name: /^Pedido con|Crear pedido \(/ }).first().click()
    await page.waitForTimeout(400)
    await page.locator('dialog[open] button.primary, dialog[open] button[type="submit"]').last().click()
  } },
  'orders-list': { go: async page => { await page.goto(`${BASE}?view=orders`) } },
  'calendar-order': { go: async page => { await page.goto(`${BASE}?view=calendar`) } },
  printers: { go: async page => { await page.goto(`${BASE}?agent`); await page.waitForTimeout(2200) } },
  'empty-history': { empty: true, go: async page => { await page.goto(`${BASE}?view=history`) } },
  'empty-orders': { empty: true, go: async page => { await page.goto(`${BASE}?view=orders`) } },
}

const only = process.argv.slice(2)
const views = Object.keys(VIEWS).filter(v => !only.length || only.includes(v))
mkdirSync(OUT, { recursive: true })

// La web ya construida (npm run build), servida como en producción, y el
// agente con sus dos impresoras simuladas (solo si se va a fotografiar).
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
const agent = views.includes('printers') ? spawn('node', ['agent/server.js', 'demo'], { stdio: 'ignore' }) : null
await new Promise(r => setTimeout(r, 2500))

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' })
let count = 0
try {
  for (const [width, height] of WIDTHS) {
    for (const theme of THEMES) {
      // Dos contextos (cada uno con su localStorage): con datos y vacío.
      for (const empty of [false, true]) {
        const mine = views.filter(v => Boolean(VIEWS[v].empty) === empty)
        if (!mine.length) continue
        const page = await (await browser.newContext({ viewport: { width, height }, locale: 'es-ES' })).newPage()
        await page.addInitScript(([t, q]) => {
          localStorage.setItem('theme', t)
          if (q && !localStorage.getItem('savedQuotes')) localStorage.setItem('savedQuotes', q)
        }, [theme, empty ? null : JSON.stringify(SAMPLE_QUOTES)])
        for (const view of mine) {
          try {
            await VIEWS[view].go(page)
            await page.waitForTimeout(400)
            await page.screenshot({ path: `${OUT}/${view}-${width}-${theme}.png`, fullPage: VIEWS[view].full !== false })
            count++
          } catch (err) {
            // Una vista que falla no tira las demás: se dice cuál y se sigue.
            console.error(`${view} ${width} ${theme}: ${err.message.split('\n')[0]}`)
          }
        }
        await page.close()
      }
    }
  }
  console.log(`${OUT}/: ${count} capturas`)
} finally {
  await browser.close()
  server.kill()
  agent?.kill()
}
