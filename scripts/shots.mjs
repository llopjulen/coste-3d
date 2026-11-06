/* ==================================================================
   SHOTS — fotografía la web a 4 anchos × 2 temas, para ver un cambio
   de diseño en todas las pantallas a la vez.

   Uso:   npm run build && npm run shots              (todas las vistas)
          npm run shots -- calculator history         (solo esas)
   Salen en shots/<vista>-<ancho>-<tema>.png (carpeta ignorada por git).

   Por qué estos anchos: 1440 (portátil grande), 1024 (portátil pequeño /
   iPad horizontal), 768 (iPad vertical) y 390 (iPhone). Son los que usa
   Taste Skill para comprobar sus páginas; entre ellos cae casi todo lo
   que se rompe (barra lateral que no cabe, tablas que desbordan...).

   Navegador: playwright-core NO trae navegador, usa el Chrome que ya
   tienes instalado (`channel: 'chrome'`). En otro sitio (un servidor sin
   Chrome) se le pasa la ruta: CHROME_PATH=/ruta/a/chrome npm run shots.
================================================================== */
import { chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const WIDTHS = [[1440, 900], [1024, 768], [768, 1024], [390, 844]]
const THEMES = ['dark', 'light']
const PORT = 4174
// Cada vista: cómo llegar a ella desde la portada (el texto de la pestaña en español).
const VIEWS = {
  calculator: null,
  history: 'Historial',
  orders: 'Pedidos',
  calendar: 'Calendario',
  plans: 'Planes',
}
// Datos de ejemplo, para que Historial y Pedidos no salgan vacíos. El id es
// la fecha en milisegundos (History la usa como fecha): noviembre de 2026.
const SAMPLE_QUOTES = [
  { id: 1793613600001, name: 'Llavero logo', client: 'Bar Pepe', price: 2.5, cost: 1.2, units: 25, date: '2026-11-02T10:00:00Z', inputs: { hours: 0.5, failRate: 8 } },
  { id: 1793700000002, name: 'Soporte de móvil', client: 'Laura G.', price: 7.94, cost: 5.22, units: 2, date: '2026-11-03T10:00:00Z', inputs: { hours: 3.5, failRate: 8 } },
  { id: 1793180000003, name: 'Maceta autorriego', client: '', price: 14.6, cost: 8.9, units: 1, date: '2026-10-28T10:00:00Z', inputs: { hours: 6, failRate: 8 } },
]

const only = process.argv.slice(2)
const views = Object.keys(VIEWS).filter(v => !only.length || only.includes(v))
mkdirSync('shots', { recursive: true })

// La web ya construida (npm run build), servida como en producción.
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
await new Promise(r => setTimeout(r, 2500))

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' })
try {
  for (const [width, height] of WIDTHS) {
    for (const theme of THEMES) {
      const page = await (await browser.newContext({ viewport: { width, height }, locale: 'es-ES' })).newPage()
      await page.addInitScript(([t, q]) => {
        localStorage.setItem('theme', t)
        if (!localStorage.getItem('savedQuotes')) localStorage.setItem('savedQuotes', q)
      }, [theme, JSON.stringify(SAMPLE_QUOTES)])
      for (const view of views) {
        await page.goto(`http://localhost:${PORT}/es/`)
        await page.waitForTimeout(400)
        if (VIEWS[view]) await page.locator('.tab', { hasText: VIEWS[view] }).first().click()
        await page.waitForTimeout(300)
        await page.screenshot({ path: `shots/${view}-${width}-${theme}.png`, fullPage: true })
      }
      await page.close()
    }
  }
  console.log(`shots/: ${views.length * WIDTHS.length * THEMES.length} capturas`)
} finally {
  await browser.close()
  server.kill()
}
