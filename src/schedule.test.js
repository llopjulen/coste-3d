/* Tests for schedule.js. Run them with:  npm test */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayKey, eventsByDay, orderHours, planOrders, suggestDue } from './schedule.js'

const TODAY = new Date(2026, 10, 4, 9) // 4 Nov 2026, local
const order = (id, hours, units, dueAt, extra = {}) => ({
  id, cost: 1, price: 2, units, status: 'order', dueAt, orderedAt: `2026-11-0${id}T10:00:00Z`,
  inputs: { hours, failRate: 0 }, ...extra,
})

test('hours of an order count the parts and the failed prints', () => {
  assert.equal(orderHours(order(1, 2, 3)), 6)
  assert.equal(orderHours({ ...order(1, 2, 3), inputs: { hours: 2, failRate: 20 } }), 7.5)
  assert.equal(orderHours({ id: 1, cost: 1, price: 2 }), null)
})

test('earliest delivery first; each order is ready when everything before it is printed', () => {
  // 14 h a week = 2 h a day.
  const plan = planOrders([order(1, 2, 3, '2026-11-20'), order(2, 1, 2, '2026-11-06')], { weekHours: 14, today: TODAY })
  assert.deepEqual(plan.map(p => p.quote.id), [2, 1])
  assert.equal(dayKey(plan[0].readyAt), '2026-11-04')  // 2 h: today
  assert.equal(dayKey(plan[1].readyAt), '2026-11-07')  // 2 + 6 = 8 h: 4 days, the 4th day is the 7th
  assert.equal(plan[0].late, false)
})

test('an order that the queue can not make in time is flagged late', () => {
  const plan = planOrders([order(1, 10, 4, '2026-11-05')], { weekHours: 14, today: TODAY })
  assert.equal(plan[0].late, true)
})

test('orders without a delivery date go last; quotes and sales are not in the queue', () => {
  const plan = planOrders([
    order(1, 1, 1, undefined),
    order(2, 1, 1, '2026-11-30'),
    { ...order(3, 1, 1, '2026-11-05'), status: 'quote' },
    { ...order(4, 1, 1, '2026-11-05'), status: 'sold', sale: { amount: 1, fees: 0, soldAt: '2026-11-03T10:00:00Z' } },
  ], { weekHours: 14, today: TODAY })
  assert.deepEqual(plan.map(p => p.quote.id), [2, 1])
})

test('without printing hours there is no estimate, and nothing breaks', () => {
  const plan = planOrders([order(1, 2, 1, '2026-11-10')], { weekHours: 0, today: TODAY })
  assert.equal(plan[0].readyAt, null)
  assert.equal(plan[0].late, false)
})

test('the suggested delivery date is the end of the queue', () => {
  const quotes = [order(1, 2, 3, '2026-11-20')] // 6 h already queued
  const fresh = { id: 9, cost: 1, price: 2, units: 2, inputs: { hours: 2, failRate: 0 } } // 4 h more
  assert.equal(suggestDue(quotes, fresh, { weekHours: 14, today: TODAY }), '2026-11-08') // 10 h at 2 h/day: day 5
})

test('the calendar shows deliveries, ready days and sales on their days', () => {
  const sold = { ...order(5, 1, 1, '2026-11-02'), status: 'sold', sale: { amount: 3, fees: 0, soldAt: '2026-11-03T12:00:00' } }
  const open = order(6, 4, 1, '2026-11-12')
  const plan = planOrders([open, sold], { weekHours: 14, today: TODAY })
  const ev = eventsByDay([open, sold], plan)
  assert.deepEqual(ev['2026-11-12'].map(e => e.kind), ['due'])
  assert.deepEqual(ev['2026-11-05'].map(e => e.kind), ['ready'])
  assert.deepEqual(ev['2026-11-03'].map(e => e.kind), ['sold'])
  assert.deepEqual(ev['2026-11-02'].map(e => e.kind), ['due'])
})
