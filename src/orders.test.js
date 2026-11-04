/* Tests for orders.js, customers.js and ordersStore.js. Run: npm test
   They protect: the money adds up to the cent, status and payment are
   independent, history records what happened, bad data never reaches the
   screen, old quote-orders migrate once and only once, and the store
   behaves like the contract a database store must also follow. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addPayment, createOrder, editOrder, formatOrderNumber, freeLine, lineFromQuote, matchesOrder, mergeOrders,
  migrateQuoteOrders, orderTotals, ordersSummary, removePayment, sanitizeOrder, sanitizeOrders, setStatus,
} from './orders.js'
import { createCustomer, customerStats, editCustomer, findByName, linkCustomers, sanitizeCustomers } from './customers.js'
import { StoreError, createLocalStore } from './ordersStore.js'
import { buildBackup, parseBackup, planRestore } from './backup.js'

const NOW = new Date('2026-11-04T10:00:00Z')
const QUOTE = { id: 111, name: 'Llavero', client: 'Bar Pepe', price: 2.5, cost: 1.2, units: 10, inputs: { hours: 0.92, failRate: 8 } }

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), map }
}
const order = (extra = {}) => createOrder({ number: 1, lines: [lineFromQuote(QUOTE)], now: NOW, ...extra })

test('a line from a quote copies its price and cost, and counts failed prints in the hours', () => {
  const l = lineFromQuote(QUOTE)
  assert.equal(l.quoteId, 111); assert.equal(l.qty, 10); assert.equal(l.unitPrice, 2.5); assert.equal(l.unitCost, 1.2)
  assert.ok(Math.abs(l.hours - 0.92 / 0.92) < 1e-9)
  assert.equal(lineFromQuote(QUOTE, 3).qty, 3)
  assert.equal(lineFromQuote({ name: 'Viejo', price: 4 }).hours, null)
})

test('totals: subtotal, shipping, discount, cost and expected profit, to the cent', () => {
  const o = editOrder(order(), { lines: [lineFromQuote(QUOTE), freeLine({ name: 'Montaje', qty: 1, unitPrice: 5 })], shipping: 4.95, discount: 2, fees: 1.5 }, NOW)
  const t = orderTotals(o)
  assert.equal(t.subtotal, 30); assert.equal(t.total, 32.95); assert.equal(t.cost, 12)
  assert.equal(t.profit, 19.45); assert.equal(t.units, 11)
  assert.equal(t.payment, 'unpaid'); assert.equal(t.due, 32.95)
})

test('payment state comes from the payments: unpaid, deposit, paid', () => {
  let o = order()
  o = addPayment(o, { amount: 10, method: 'bizum' }, NOW)
  assert.equal(orderTotals(o).payment, 'deposit'); assert.equal(orderTotals(o).due, 15)
  o = addPayment(o, { amount: 15, method: 'cash' }, NOW)
  assert.equal(orderTotals(o).payment, 'paid'); assert.equal(orderTotals(o).realProfit, 25 - 12)
  o = removePayment(o, o.payments[0].id, NOW)
  assert.equal(orderTotals(o).paid, 15)
  assert.deepEqual(o.history.map(e => e.type), ['created', 'payment', 'payment', 'paymentRemoved'])
})

test('a payment of 0, negative or without a real date is refused', () => {
  const o = order()
  assert.equal(addPayment(o, { amount: 0 }, NOW), o)
  assert.equal(addPayment(o, { amount: -5 }, NOW), o)
  assert.equal(addPayment(o, { amount: 5, at: '31/12/2026' }, NOW), o)
})

test('status is independent of payment and every change is in the history', () => {
  let o = addPayment(order(), { amount: 25 }, NOW)
  o = setStatus(o, 'printing', NOW)
  o = setStatus(o, 'delivered', NOW)
  assert.equal(o.deliveredAt, '2026-11-04')
  assert.equal(orderTotals(o).payment, 'paid')
  o = setStatus(o, 'ready', NOW)
  assert.equal(o.deliveredAt, null)
  assert.deepEqual(o.history.filter(e => e.type === 'status').map(e => `${e.from}>${e.to}`), ['pending>printing', 'printing>delivered', 'delivered>ready'])
  assert.equal(setStatus(o, 'nonsense', NOW), o)
})

test('edits only touch editable fields, and quick edits share one history entry', () => {
  let o = editOrder(order(), { notes: 'a', number: 99, id: 'hacked' }, NOW)
  assert.equal(o.number, 1); assert.notEqual(o.id, 'hacked')
  o = editOrder(o, { notes: 'ab' }, new Date(NOW.getTime() + 60_000))
  assert.equal(o.history.filter(e => e.type === 'edited').length, 1)
  o = editOrder(o, { notes: 'abc' }, new Date(NOW.getTime() + 20 * 60_000))
  assert.equal(o.history.filter(e => e.type === 'edited').length, 2)
})

test('sanitize drops broken orders and broken parts of orders, never trusts the file', () => {
  assert.equal(sanitizeOrder({ id: 'x', number: 0, createdAt: NOW.toISOString() }), null)
  const o = sanitizeOrder({
    ...order(), status: 'lost', shipping: -3, dueAt: '2026-02-31x',
    lines: [{ id: 'l', name: 'ok', qty: 2, unitPrice: 'free' }, { id: 'l', name: 'dup' }, { name: 'no id' }],
    payments: [{ id: 'p', amount: 5, at: '2026-11-01', method: 'crypto' }, { id: 'q', amount: 'x', at: '2026-11-01' }],
    history: [{ at: 'nope', type: 'created' }, { at: NOW.toISOString(), type: 'status', from: 'pending', to: 'hacked' }],
  })
  assert.equal(o.status, 'pending'); assert.equal(o.shipping, 0); assert.equal(o.dueAt, null)
  assert.deepEqual(o.lines.map(l => [l.name, l.qty, l.unitPrice]), [['ok', 2, 0]])
  assert.deepEqual(o.payments.map(p => p.method), ['other'])
  assert.deepEqual(o.history, [{ at: NOW.toISOString(), type: 'status', from: 'pending' }])
  assert.deepEqual(sanitizeOrders('nope'), [])
})

test('summary: open, late, to collect, collected and profit of delivered; cancelled count for nothing', () => {
  const a = createOrder({ number: 1, lines: [lineFromQuote(QUOTE)], dueAt: '2020-01-01', now: NOW })
  const b = setStatus(addPayment(order({ number: 2 }), { amount: 25 }, NOW), 'delivered', NOW)
  const c = setStatus(order({ number: 3 }), 'cancelled', NOW)
  assert.deepEqual(ordersSummary([a, b, c]), { open: 1, late: 1, toCollect: 25, collected: 25, profit: 13 })
})

test('search by number, client and part name', () => {
  const o = createOrder({ number: 12, customer: { id: 'c', name: 'Floristería Ana' }, lines: [lineFromQuote(QUOTE)], now: NOW })
  assert.equal(formatOrderNumber(12), '#0012')
  for (const q of ['#0012', '12', 'florister', 'llavero', '']) assert.ok(matchesOrder(o, q), q)
  assert.ok(!matchesOrder(o, 'maceta'))
})

test('migration: old quote-orders become orders once, sold ones delivered and paid', () => {
  const quotes = [
    { ...QUOTE, id: 1, status: 'order', dueAt: '2026-11-20', createdAt: '2026-11-01T09:00:00Z' },
    { ...QUOTE, id: 2, status: 'sold', sale: { amount: 24, fees: 2, channel: 'Etsy', soldAt: '2026-10-30' } },
    { ...QUOTE, id: 3 },
  ]
  const first = migrateQuoteOrders(quotes, { firstNumber: 5, now: NOW })
  assert.equal(first.orders.length, 2)
  const [pending, sold] = first.orders
  assert.deepEqual([pending.number, pending.status, pending.dueAt, pending.customerName], [5, 'pending', '2026-11-20', 'Bar Pepe'])
  assert.deepEqual([sold.status, sold.deliveredAt, sold.fees, sold.channel, orderTotals(sold).paid], ['delivered', '2026-10-30', 2, 'Etsy', 24])
  assert.equal(first.nextNumber, 7)
  assert.equal(first.quotes[2].orderId, undefined)
  // Idempotent: a second run finds nothing to do.
  assert.equal(migrateQuoteOrders(first.quotes, { now: NOW }).orders.length, 0)
})

test('merge keeps this browser’s copy and renumbers new orders whose number is taken', () => {
  const here = [order({ number: 1 }), order({ number: 2 })]
  const there = [here[0], order({ number: 2 }), order({ number: 3 })]
  const { orders, renumbered } = mergeOrders(here, there)
  assert.equal(orders.length, 4); assert.equal(renumbered, 1)
  assert.deepEqual(orders.map(o => o.number).sort(), [1, 2, 3, 4])
  // The incoming #3 kept its number; the clashing #2 moved above everything.
  assert.equal(orders.find(o => o.id === there[2].id).number, 3)
  assert.equal(orders.find(o => o.id === there[1].id).number, 4)
})

test('customers: validation, same-name lookup ignoring accents, stats and linking', () => {
  const ana = createCustomer({ name: ' Ana López ', email: 'no-at-sign' }, NOW)
  assert.equal(ana.name, 'Ana López'); assert.equal(ana.email, '')
  assert.equal(findByName([ana], 'ana lopez'), ana)
  assert.deepEqual(sanitizeCustomers([ana, ana, { id: 'x' }]).length, 1)
  assert.equal(editCustomer(ana, { name: '' }, NOW), ana)
  const o1 = addPayment(createOrder({ number: 1, customer: ana, lines: [lineFromQuote(QUOTE)], now: NOW }), { amount: 10 }, NOW)
  const o2 = setStatus(createOrder({ number: 2, customer: ana, lines: [lineFromQuote(QUOTE)], now: NOW }), 'cancelled', NOW)
  assert.deepEqual(customerStats(ana.id, [o1, o2]), { count: 1, spent: 10, due: 15, lastOrderAt: o1.createdAt })
  const loose = createOrder({ number: 3, customer: { id: null, name: 'ANA LÓPEZ' }, lines: [], now: NOW })
  const fresh = createOrder({ number: 4, customer: { id: null, name: 'Bar Pepe' }, lines: [], now: NOW })
  const linked = linkCustomers([loose, fresh], [ana], NOW)
  assert.equal(linked.orders[0].customerId, ana.id)
  assert.equal(linked.customers.length, 2)
})

test('local store: save, numbers, unique number, delete customer unlinks its orders', async () => {
  const s = fakeStorage()
  const store = createLocalStore(s)
  const ana = await store.saveCustomer(createCustomer({ name: 'Ana' }, NOW))
  const n1 = await store.nextOrderNumber()
  const n2 = await store.nextOrderNumber()
  assert.deepEqual([n1, n2], [1, 2])
  const o = await store.saveOrder(createOrder({ number: n1, customer: ana, lines: [lineFromQuote(QUOTE)], now: NOW }))
  await assert.rejects(store.saveOrder(createOrder({ number: n1, lines: [], now: NOW })), StoreError)
  await store.saveOrder(setStatus(o, 'printing', NOW))
  let data = await store.load()
  assert.equal(data.orders.length, 1); assert.equal(data.orders[0].status, 'printing')
  await store.deleteCustomer(ana.id)
  data = await store.load()
  assert.equal(data.customers.length, 0)
  assert.equal(data.orders[0].customerId, null); assert.equal(data.orders[0].customerName, 'Ana')
  await store.deleteOrder(o.id)
  assert.equal((await store.load()).orders.length, 0)
  // The counter never goes back, even with no orders left.
  assert.equal(await store.nextOrderNumber(), 3)
})

test('local store: a full browser is an error, not a silent loss', async () => {
  const full = { getItem: () => null, setItem() { throw new Error('QuotaExceededError') }, removeItem() {} }
  await assert.rejects(createLocalStore(full).saveOrder(order()), StoreError)
})

test('backup: orders and customers go in the file; an older file never wipes them', () => {
  const ana = createCustomer({ name: 'Ana' }, NOW)
  const o = order({ customer: ana })
  const parsed = parseBackup(JSON.stringify(buildBackup({ quotes: [], orders: [o], customers: [ana], orderCounter: 7 })))
  assert.equal(parsed.orders[0].id, o.id); assert.equal(parsed.customers[0].id, ana.id); assert.equal(parsed.orderCounter, 7)
  const old = parseBackup(JSON.stringify(buildBackup({ quotes: [] })))
  const current = { quotes: [], business: null, counter: null, setup: null, events: [], orders: [o], customers: [ana], orderCounter: 9 }
  for (const mode of ['merge', 'replace']) {
    const plan = planRestore(current, old, mode)
    assert.equal(plan.orders.length, 1, mode); assert.equal(plan.customers.length, 1, mode); assert.equal(plan.orderCounter, 9, mode)
  }
})
