/* Tests for schedule.js: the print queue over orders. Run: npm test */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayKey, eventsByDay, linesHours, planOrders, suggestDue } from './schedule.js'
import { addPayment, createOrder, setStatus } from './orders.js'

const TODAY = new Date(2026, 10, 4) // 4 Nov 2026, local
const NOW = new Date('2026-11-04T10:00:00Z')
// 70 h a week = 10 h a day, so the arithmetic is easy to follow.
const WEEK = 70
const line = (hours, qty = 1) => ({ id: `l${hours}-${qty}`, name: 'Part', qty, unitPrice: 5, unitCost: 2, hours, quoteId: null })
const order = (number, hours, extra = {}) => ({ ...createOrder({ number, lines: [line(hours)], now: NOW }), ...extra })

test('hours of a set of lines: hours per part × quantity; null if no line knows its time', () => {
  assert.equal(linesHours([line(2, 3), line(1.5)]), 7.5)
  assert.equal(linesHours([{ ...line(1), hours: null }]), null)
})

test('earliest delivery first; each order is ready when everything before it is printed', () => {
  const a = order(1, 20, { dueAt: '2026-11-10' })
  const b = order(2, 10, { dueAt: '2026-11-06' })
  const plan = planOrders([a, b], { weekHours: WEEK, today: TODAY })
  assert.deepEqual(plan.map(p => p.order.number), [2, 1])
  assert.deepEqual(plan.map(p => dayKey(p.readyAt)), ['2026-11-04', '2026-11-06'])
})

test('an order the queue can not make in time is flagged late', () => {
  const plan = planOrders([order(1, 50, { dueAt: '2026-11-05' })], { weekHours: WEEK, today: TODAY })
  assert.equal(plan[0].late, true)
})

test('only pending and printing orders take printer time; no date goes last', () => {
  const ready = setStatus(order(1, 99, { dueAt: '2026-11-05' }), 'ready', NOW)
  const done = setStatus(order(2, 99), 'delivered', NOW)
  const undated = order(3, 5)
  const dated = order(4, 5, { dueAt: '2026-12-01' })
  const plan = planOrders([ready, done, undated, dated], { weekHours: WEEK, today: TODAY })
  assert.deepEqual(plan.map(p => p.order.number), [4, 3])
})

test('without printing hours there is no estimate, and nothing breaks', () => {
  const plan = planOrders([order(1, 5, { dueAt: '2026-11-05' })], { today: TODAY })
  assert.equal(plan[0].readyAt, null); assert.equal(plan[0].late, false)
  assert.equal(suggestDue([], [line(5)], { today: TODAY }), null)
})

test('the suggested delivery date is the end of the queue plus the new parts', () => {
  const queue = [order(1, 15)]
  assert.equal(suggestDue(queue, [line(10)], { weekHours: WEEK, today: TODAY }), '2026-11-06')
  assert.equal(suggestDue([], [line(3)], { weekHours: WEEK, today: TODAY }), '2026-11-04')
})

test('the calendar shows deliveries, ready days and payments on their days', () => {
  const a = addPayment(order(1, 25, { dueAt: '2026-11-20' }), { amount: 10, at: '2026-11-03' }, NOW)
  const cancelled = setStatus(order(2, 5, { dueAt: '2026-11-21' }), 'cancelled', NOW)
  const plan = planOrders([a, cancelled], { weekHours: WEEK, today: TODAY })
  const ev = eventsByDay([a, cancelled], plan)
  assert.deepEqual(ev['2026-11-20'].map(e => e.kind), ['due'])
  assert.deepEqual(ev['2026-11-06'].map(e => e.kind), ['ready'])
  assert.deepEqual(ev['2026-11-03'].map(e => [e.kind, e.amount]), [['paid', 10]])
  assert.equal(ev['2026-11-21'], undefined)
})
