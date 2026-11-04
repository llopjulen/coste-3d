/* ==================================================================
   CUSTOMERS — who buys, and what they've bought.

   Shape: { id, name, email, phone, notes, createdAt, updatedAt }
   Orders point to a customer with `customerId` (orders.js) and keep a
   copy of the name. Everything about a customer that comes from orders
   (how many, how much, when last) is computed, never stored: it can't
   drift from the orders themselves.

   No validation of the email format beyond its length and an "@": a
   customer card is a note for the workshop, not a login, and rejecting a
   typo would only lose it.
================================================================== */
import { newId, orderTotals } from './orders.js'

export const MAX_CUSTOMERS = 5000
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
const isIso = v => typeof v === 'string' && Number.isFinite(Date.parse(v))
const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v)

export function sanitizeCustomer(raw) {
  if (!isPlain(raw) || typeof raw.id !== 'string' || !raw.id || raw.id.length > 64) return null
  const name = text(raw.name, 80)
  if (!name || !isIso(raw.createdAt)) return null
  const email = text(raw.email, 120)
  return {
    id: raw.id,
    name,
    email: email.includes('@') ? email : '',
    phone: text(raw.phone, 40),
    notes: text(raw.notes, 1000),
    createdAt: raw.createdAt,
    updatedAt: isIso(raw.updatedAt) ? raw.updatedAt : raw.createdAt,
  }
}

/* A list -> valid customers, one per id, by name (as a contacts app). */
export function sanitizeCustomers(raw) {
  if (!Array.isArray(raw)) return []
  const seen = new Set()
  const out = []
  for (const item of raw) {
    const c = sanitizeCustomer(item)
    if (!c || seen.has(c.id)) continue
    seen.add(c.id)
    out.push(c)
    if (out.length >= MAX_CUSTOMERS) break
  }
  return sortCustomers(out)
}

// localeCompare with the browser's locale: "Ángela" next to "Ana", not after "Zoe".
export const sortCustomers = list => [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

export function createCustomer({ name, email = '', phone = '', notes = '' }, now = new Date()) {
  const at = new Date(now).toISOString()
  return sanitizeCustomer({ id: newId(), name, email, phone, notes, createdAt: at, updatedAt: at })
}

export function editCustomer(c, patch, now = new Date()) {
  const next = sanitizeCustomer({ ...c, ...patch, id: c.id, createdAt: c.createdAt, updatedAt: new Date(now).toISOString() })
  return next ?? c
}

/* Same name, ignoring case and accents: used to reuse a customer instead
   of creating "Bar Pepe" twice (and by the migration of old orders). */
const key = name => name.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()
export const findByName = (customers, name) => customers.find(c => key(c.name) === key(name ?? '')) ?? null

/* What a customer has done, from the orders. Cancelled ones don't count. */
export function customerStats(customerId, orders) {
  let count = 0, spent = 0, due = 0, last = null
  for (const o of orders) {
    if (o.customerId !== customerId || o.status === 'cancelled') continue
    const t = orderTotals(o)
    count++
    spent += t.paid
    due += t.due
    if (!last || o.createdAt > last) last = o.createdAt
  }
  return { count, spent: Math.round(spent * 100) / 100, due: Math.round(due * 100) / 100, lastOrderAt: last }
}

/* Gives every order whose client is only a name (old orders, migrated
   ones) a customer card: an existing one with the same name, or a new
   one. Returns the new lists; orders that already have a card are left
   alone, so it is safe to run more than once. */
export function linkCustomers(orders, customers, now = new Date()) {
  const list = [...customers]
  const next = orders.map(o => {
    if (o.customerId || !o.customerName) return o
    let c = findByName(list, o.customerName)
    if (!c) {
      c = createCustomer({ name: o.customerName }, now)
      if (!c) return o
      list.push(c)
    }
    return { ...o, customerId: c.id }
  })
  return { orders: next, customers: sortCustomers(list) }
}

/* Union by id for a "merge" restore; this browser's card wins. */
export function mergeCustomers(current, incoming) {
  const byId = new Map(incoming.map(c => [c.id, c]))
  for (const c of current) byId.set(c.id, c)
  return sortCustomers([...byId.values()])
}
