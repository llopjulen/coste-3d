/* ==================================================================
   ROUTE — which screen is open, written in the URL.

   Until 2026-11-06 the open tab lived only in React state: reloading went
   back to the calculator, the browser's Back button left the site instead
   of going to the previous tab, and nobody could send a link to "Orders".
   Vercel's Web Interface Guidelines: "URL reflects state" and "deep-link
   everything".

   Shape:   /es/?view=orders&order=<id>
   - The path (/, /es/, /fr/) stays the language, as before.
   - `view` = the tab. No `view` = the calculator, so the plain address of
     the site keeps meaning what it always meant.
   - `order` / `customer` = a page open inside Orders.
   - Any other parameter already there (?agent) is kept as it is.

   Query parameters and not /es/orders: GitHub Pages serves static files,
   and /es/orders would be a 404 (there is no orders/index.html). A query
   string reaches the same /es/index.html.

   Pure functions: App does the pushState / popstate wiring.
================================================================== */

// Tabs that can be opened from a link. 'report' and 'quote' are in the
// URL too (so Back from them returns to History), but they show what was
// selected in History a moment before: opened cold from a link there is
// nothing to show, so they fall back to History.
export const LINKABLE = ['history', 'orders', 'calendar', 'plans', 'printers']
export const TRANSIENT = ['report', 'quote']

const isId = v => typeof v === 'string' && /^[\w-]{1,64}$/.test(v)

/* "?view=orders&order=abc" -> { view: 'orders', open: { kind: 'order', id: 'abc' } }.
   Anything unknown or malformed is ignored, never trusted: a link is
   typed by someone else. */
export function parseRoute(search) {
  const p = new URLSearchParams(search)
  const raw = p.get('view')
  const view = LINKABLE.includes(raw) || TRANSIENT.includes(raw) ? raw : 'calculator'
  let open = null
  if (view === 'orders') {
    if (isId(p.get('order'))) open = { kind: 'order', id: p.get('order') }
    else if (isId(p.get('customer'))) open = { kind: 'customer', id: p.get('customer') }
  }
  return { view, open }
}

/* The search string for a screen, keeping every other parameter already
   in `current`. Returns '' or '?…', ready for history.pushState. */
export function buildSearch(current, { view, open = null }) {
  const p = new URLSearchParams(current)
  for (const k of ['view', 'order', 'customer']) p.delete(k)
  if (view && view !== 'calculator') p.set('view', view)
  if (view === 'orders' && open && isId(open.id)) p.set(open.kind === 'customer' ? 'customer' : 'order', open.id)
  const s = p.toString()
  return s ? `?${s}` : ''
}
