/* ==================================================================
   ORDERS — what a client asked for, from "yes" to delivered and paid.

   Until now an "order" was a state of one saved quote (sales.js): one
   part, one order. A workshop sells ORDERS: several parts, a client, a
   delivery date, a deposit and the rest on delivery. So an order is its
   own record, and quotes become what they always were: the priced parts.

   Shape (EUR, like every amount in the app; dates as in schedule.js):
   {
     id:        string (UUID; the primary key in the database too)
     number:    integer, per person, 1, 2, 3… (shown as #0012)
     customerId: string | null   -> customers.js
     customerName: string        the client's name WHEN the order was made
     status:    'pending' | 'printing' | 'ready' | 'delivered' | 'cancelled'
     lines:     [{ id, quoteId|null, name, qty, unitPrice, unitCost, hours|null }]
     shipping, discount, fees:   numbers ≥ 0 (fees: platform / payment)
     channel:   string ("Etsy", "Wallapop", "Direct"…)
     payments:  [{ id, amount, method, at: 'YYYY-MM-DD', note }]
     dueAt:     'YYYY-MM-DD' | null    delivery agreed with the client
     deliveredAt: 'YYYY-MM-DD' | null
     notes:     string
     createdAt, updatedAt: ISO
     history:   [{ at: ISO, type, from?, to?, amount? }]   newest last
   }

   Decisions (the why is in DEV_LOG.md and docs/PEDIDOS.md):
   - Status and payment are SEPARATE axes. "Delivered but half paid" and
     "paid upfront, not printed yet" are both everyday cases; one list of
     states would need every combination.
   - The payment state (unpaid / deposit / paid) is never stored: it is
     derived from the payments, so it can't disagree with them.
   - Lines keep a COPY of name, price and cost: an order is a commitment at
     the price agreed that day. Editing or deleting the quote later must
     not change what was sold. `quoteId` is only a link back.
   - `customerName` is a snapshot for the same reason (invoices keep the
     name of the day); `customerId` links to the customer's card.

   Pure functions only: no React, no storage (ordersStore.js does that).
================================================================== */

export const ORDER_STATUSES = ['pending', 'printing', 'ready', 'delivered', 'cancelled']
// The ones still in the workshop: they need printer time and appear in the queue.
export const OPEN_STATUSES = ['pending', 'printing', 'ready']
export const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'bizum', 'platform', 'other']

// Limits: a tampered backup or a runaway client must not fill storage.
export const MAX_LINES = 50
export const MAX_PAYMENTS = 50
export const MAX_HISTORY = 200
export const MAX_ORDERS = 5000

const finite = v => typeof v === 'number' && Number.isFinite(v)
const money = v => (finite(v) && v >= 0 ? Math.round(v * 10000) / 10000 : 0)
const round2 = n => Math.round(n * 100) / 100
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const isIso = v => typeof v === 'string' && Number.isFinite(Date.parse(v))
export const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v))
const isId = v => typeof v === 'string' && v.length > 0 && v.length <= 64
const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v)

export function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// Local "YYYY-MM-DD" (not toISOString: in Spain after 23:00 UTC that is already tomorrow).
export function today(now = new Date()) {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const formatOrderNumber = n => `#${String(n).padStart(4, '0')}`

/* ------------------------------------------------------------------
   Lines
------------------------------------------------------------------ */

/* A saved quote -> an order line, priced as the quote was. `hours` is
   printer time per GOOD part, failed prints included (÷ (1 − failure
   rate)), the same rule as capacity() and the print queue. */
export function lineFromQuote(q, qty) {
  const i = q?.inputs
  const ok = 1 - Math.min(Math.max(finite(i?.failRate) ? i.failRate : 0, 0) / 100, 0.95)
  const units = Number.isSafeInteger(qty) && qty >= 1 ? qty : Number.isSafeInteger(q?.units) && q.units >= 1 ? q.units : 1
  return {
    id: newId(),
    quoteId: finite(q?.id) ? q.id : null,
    name: text(q?.name, 80) || '—',
    qty: units,
    unitPrice: money(q?.price),
    unitCost: money(q?.cost),
    hours: finite(i?.hours) && i.hours > 0 ? i.hours / ok : null,
  }
}

/* A line written by hand ("Assembly", "Rush fee"): no quote behind it. */
export function freeLine({ name = '', qty = 1, unitPrice = 0, unitCost = 0 } = {}) {
  return { id: newId(), quoteId: null, name: text(name, 80), qty, unitPrice: money(unitPrice), unitCost: money(unitCost), hours: null }
}

function sanitizeLine(raw) {
  if (!isPlain(raw) || !isId(raw.id)) return null
  const name = text(raw.name, 80)
  if (!name) return null
  return {
    id: raw.id,
    quoteId: finite(raw.quoteId) ? raw.quoteId : null,
    name,
    qty: Number.isSafeInteger(raw.qty) && raw.qty >= 1 && raw.qty <= 100000 ? raw.qty : 1,
    unitPrice: money(raw.unitPrice),
    unitCost: money(raw.unitCost),
    hours: finite(raw.hours) && raw.hours > 0 ? raw.hours : null,
  }
}

function sanitizePayment(raw) {
  if (!isPlain(raw) || !isId(raw.id) || !finite(raw.amount) || raw.amount <= 0 || !isDay(raw.at)) return null
  return {
    id: raw.id,
    amount: round2(raw.amount),
    method: PAYMENT_METHODS.includes(raw.method) ? raw.method : 'other',
    at: raw.at,
    note: text(raw.note, 120),
  }
}

const EVENT_TYPES = ['created', 'status', 'payment', 'paymentRemoved', 'edited']
function sanitizeEvent(raw) {
  if (!isPlain(raw) || !isIso(raw.at) || !EVENT_TYPES.includes(raw.type)) return null
  const e = { at: raw.at, type: raw.type }
  if (ORDER_STATUSES.includes(raw.from)) e.from = raw.from
  if (ORDER_STATUSES.includes(raw.to)) e.to = raw.to
  if (finite(raw.amount)) e.amount = round2(raw.amount)
  return e
}

const listOf = (raw, fn, max) => {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const out = []
  for (const item of raw) {
    const clean = fn(item)
    if (!clean) continue
    // Events have no id; lines and payments are de-duplicated by theirs.
    if (clean.id) { if (seen.has(clean.id)) continue; seen.add(clean.id) }
    out.push(clean)
    if (out.length >= max) break
  }
  return out
}

/* ------------------------------------------------------------------
   Validation: the same rule as backup.js. Required fields missing ->
   null (the order can't be shown); optional ones of the wrong type are
   dropped or reset, so one bad field doesn't lose the whole order.
------------------------------------------------------------------ */
export function sanitizeOrder(raw) {
  if (!isPlain(raw) || !isId(raw.id)) return null
  if (!Number.isSafeInteger(raw.number) || raw.number < 1) return null
  if (!isIso(raw.createdAt)) return null
  return {
    id: raw.id,
    number: raw.number,
    customerId: isId(raw.customerId) ? raw.customerId : null,
    customerName: text(raw.customerName, 80),
    status: ORDER_STATUSES.includes(raw.status) ? raw.status : 'pending',
    lines: listOf(raw.lines, sanitizeLine, MAX_LINES),
    shipping: money(raw.shipping),
    discount: money(raw.discount),
    fees: money(raw.fees),
    channel: text(raw.channel, 40),
    payments: listOf(raw.payments, sanitizePayment, MAX_PAYMENTS),
    dueAt: isDay(raw.dueAt) ? raw.dueAt : null,
    deliveredAt: isDay(raw.deliveredAt) ? raw.deliveredAt : null,
    notes: text(raw.notes, 2000),
    createdAt: raw.createdAt,
    updatedAt: isIso(raw.updatedAt) ? raw.updatedAt : raw.createdAt,
    // Keep the newest events if there are too many: they are the useful ones.
    history: listOf(raw.history, sanitizeEvent, Infinity).slice(-MAX_HISTORY),
  }
}

/* A list -> valid orders, one per id, newest first. */
export function sanitizeOrders(raw) {
  return sortOrders(listOf(raw, sanitizeOrder, MAX_ORDERS))
}

/* Newest order first (by number: it never repeats and grows with time). */
export const sortOrders = list => [...list].sort((a, b) => b.number - a.number)

/* ------------------------------------------------------------------
   Changes. Each returns a NEW order (React compares references) with
   updatedAt moved and, when it matters, an event in `history`.
------------------------------------------------------------------ */
const log = (order, event, now) => {
  const at = new Date(now).toISOString()
  return { ...order, updatedAt: at, history: [...order.history, { at, ...event }].slice(-MAX_HISTORY) }
}

/* A new order. The number comes from the store (ordersStore.nextNumber),
   because only the store knows the last one used. */
export function createOrder({ number, customer = null, lines = [], dueAt = null, channel = '', notes = '', now = new Date() }) {
  const at = new Date(now).toISOString()
  return sanitizeOrder({
    id: newId(),
    number,
    customerId: customer?.id ?? null,
    customerName: customer?.name ?? '',
    status: 'pending',
    lines,
    shipping: 0,
    discount: 0,
    fees: 0,
    channel,
    payments: [],
    dueAt,
    deliveredAt: null,
    notes,
    createdAt: at,
    updatedAt: at,
    history: [{ at, type: 'created' }],
  })
}

export function setStatus(order, status, now = new Date()) {
  if (!ORDER_STATUSES.includes(status) || status === order.status) return order
  const next = log({ ...order, status }, { type: 'status', from: order.status, to: status }, now)
  // The delivery day is the day it was marked delivered; going back clears it.
  next.deliveredAt = status === 'delivered' ? (order.deliveredAt ?? today(now)) : null
  return next
}

export function addPayment(order, { amount, method = 'other', at, note = '' }, now = new Date()) {
  const p = sanitizePayment({ id: newId(), amount, method, at: at ?? today(now), note })
  if (!p || order.payments.length >= MAX_PAYMENTS) return order
  return log({ ...order, payments: [...order.payments, p] }, { type: 'payment', amount: p.amount }, now)
}

export function removePayment(order, id, now = new Date()) {
  const p = order.payments.find(x => x.id === id)
  if (!p) return order
  return log({ ...order, payments: order.payments.filter(x => x.id !== id) }, { type: 'paymentRemoved', amount: p.amount }, now)
}

/* Any other edit (lines, client, date, notes, shipping…). Only the fields
   that exist in the model are taken, and the result is validated again.
   Consecutive edits within 10 minutes share one "edited" event: typing a
   note letter by letter shouldn't fill the history. */
const EDITABLE = ['customerId', 'customerName', 'lines', 'shipping', 'discount', 'fees', 'channel', 'dueAt', 'notes']
export function editOrder(order, patch, now = new Date()) {
  const picked = Object.fromEntries(Object.entries(patch ?? {}).filter(([k]) => EDITABLE.includes(k)))
  const clean = sanitizeOrder({ ...order, ...picked })
  if (!clean) return order
  const last = order.history.at(-1)
  if (last?.type === 'edited' && new Date(now) - Date.parse(last.at) < 10 * 60_000) {
    return { ...clean, updatedAt: new Date(now).toISOString() }
  }
  return log(clean, { type: 'edited' }, now)
}

/* ------------------------------------------------------------------
   Numbers
------------------------------------------------------------------ */

/* Everything the screen needs about the money of one order.
   - subtotal: Σ qty × unitPrice;  total = subtotal + shipping − discount
   - cost:     Σ qty × unitCost (what making it costs)
   - paid / due, and the payment state derived from them
   - profit:   total − fees − cost (expected); realProfit uses what was
               actually paid, so a half-paid order isn't counted as earned.
   Rounded to cents at the end, not per line, so the sums don't drift. */
export function orderTotals(order) {
  const subtotal = order.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
  const cost = order.lines.reduce((s, l) => s + l.qty * l.unitCost, 0)
  const total = Math.max(subtotal + order.shipping - order.discount, 0)
  const paid = order.payments.reduce((s, p) => s + p.amount, 0)
  const due = Math.max(total - paid, 0)
  // Within half a cent counts as paid: totals with 4-decimal unit prices round.
  const payment = paid <= 0.005 ? 'unpaid' : due <= 0.005 ? 'paid' : 'deposit'
  const units = order.lines.reduce((s, l) => s + l.qty, 0)
  const hours = order.lines.every(l => l.hours === null) ? null : order.lines.reduce((s, l) => s + (l.hours ?? 0) * l.qty, 0)
  return {
    subtotal: round2(subtotal),
    total: round2(total),
    cost: round2(cost),
    paid: round2(paid),
    due: round2(due),
    payment,
    units,
    hours,
    profit: round2(total - order.fees - cost),
    realProfit: round2(paid - order.fees - cost),
  }
}

/* The numbers for the top of the Orders tab, over a list of orders.
   Cancelled orders count for nothing. */
export function ordersSummary(orders) {
  let open = 0, toCollect = 0, collected = 0, profit = 0, late = 0
  const now = today()
  for (const o of orders) {
    if (o.status === 'cancelled') continue
    const t = orderTotals(o)
    if (OPEN_STATUSES.includes(o.status)) {
      open++
      if (o.dueAt && o.dueAt < now) late++
    }
    toCollect += t.due
    collected += t.paid
    if (o.status === 'delivered') profit += t.realProfit
  }
  return { open, late, toCollect: round2(toCollect), collected: round2(collected), profit: round2(profit) }
}

/* Free-text search over number, client, notes and line names. */
export function matchesOrder(order, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const hay = [formatOrderNumber(order.number), String(order.number), order.customerName, order.notes, order.channel, ...order.lines.map(l => l.name)]
  return hay.some(s => s.toLowerCase().includes(q))
}

/* ------------------------------------------------------------------
   Migration from the old model: a saved quote with status 'order' or
   'sold' (sales.js) becomes one order, so nobody loses what they had.
   - 'order' -> pending, with its delivery date.
   - 'sold'  -> delivered on the sale day, with one payment for the
                amount received and its fees.
   The quote gets `orderId`, so running this again does nothing (it is
   idempotent: it can run on every start without duplicating orders).
------------------------------------------------------------------ */
export function migrateQuoteOrders(quotes, { firstNumber = 1, now = new Date() } = {}) {
  let number = firstNumber
  const orders = []
  const nextQuotes = quotes.map(q => {
    if (q.orderId || (q.status !== 'order' && q.status !== 'sold')) return q
    const sold = q.status === 'sold' && q.sale
    const created = isIso(q.createdAt) ? q.createdAt : new Date(now).toISOString()
    let order = createOrder({
      number: number++,
      customer: q.client ? { id: null, name: q.client } : null,
      lines: [lineFromQuote(q)],
      dueAt: isDay(q.dueAt) ? q.dueAt : null,
      channel: sold ? q.sale.channel : '',
      now: created,
    })
    if (!order) return q
    if (sold) {
      // soldAt is 'YYYY-MM-DD' from the sale form, or a full ISO date in older data.
      const day = isDay(q.sale.soldAt) ? q.sale.soldAt : isIso(q.sale.soldAt) ? today(q.sale.soldAt) : today(now)
      order = addPayment({ ...order, fees: money(q.sale.fees) }, { amount: q.sale.amount, method: 'other', at: day }, now)
      order = setStatus(order, 'delivered', now)
      order.deliveredAt = day
    }
    orders.push(order)
    return { ...q, orderId: order.id }
  })
  return { orders, quotes: nextQuotes, nextNumber: number }
}

/* Union of two order lists for a "merge" restore.
   - Same id: the same order; the one in this browser wins (orders are
     edited, so a different copy is an older or newer edit, and the person
     is looking at this one).
   - A new id whose number is already taken (two devices made order #12
     without syncing): it keeps its data and gets the next free number, so
     numbers stay unique. */
export function mergeOrders(current, incoming) {
  const byId = new Map(current.map(o => [o.id, o]))
  const used = new Set(current.map(o => o.number))
  // Above every number on BOTH sides: a renumbered order must not take the
  // number of another incoming one that would have kept its own.
  let top = Math.max(0, ...used, ...incoming.map(o => o.number))
  let renumbered = 0
  for (const o of incoming) {
    if (byId.has(o.id)) continue
    let next = o
    if (used.has(o.number)) { next = { ...o, number: ++top }; renumbered++ }
    used.add(next.number)
    top = Math.max(top, next.number)
    byId.set(next.id, next)
  }
  return { orders: sortOrders([...byId.values()]), renumbered }
}

/* quote id -> the order it went into, for History ("in order #0012").
   If a quote is in several orders, the newest one that isn't cancelled
   wins (orders come newest first). */
export function ordersByQuote(orders) {
  const map = new Map()
  for (const o of orders) {
    for (const l of o.lines) {
      if (l.quoteId === null) continue
      const current = map.get(l.quoteId)
      if (!current || (current.status === 'cancelled' && o.status !== 'cancelled')) map.set(l.quoteId, o)
    }
  }
  return map
}
