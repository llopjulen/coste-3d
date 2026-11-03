/* Tests for advice.js. Run them with:  npm test */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_TIPS, adviceFor } from './advice.js'
import { calculate } from './calculate.js'

// The calculator's defaults (INITIAL in App.jsx).
const BASE = {
  spoolPrice: 20, spoolWeight: 1000, partGrams: 45, purgeGrams: 0,
  hours: 3.5, postMinutes: 10, packaging: 0.8, quantity: 1, currentPrice: 12,
  printerPrice: 700, lifespan: 3000, watts: 110, kwhPrice: 0.15, failRate: 8,
  hourlyRate: 15, fee: 8, margin: 40, extraFilaments: [],
}
const ids = d => adviceFor({ ...BASE, ...d }).map(t => t.id)

test('the defaults give one tip: 10 min of work at 15/h is almost half the cost', () => {
  assert.deepEqual(ids({}), ['laborHeavy'])
})

test('a part with nothing worth flagging gives no tips', () => {
  assert.deepEqual(ids({ postMinutes: 2 }), [])
})

test('underpriced: the real margin at the current price', () => {
  const d = { ...BASE, currentPrice: 6.5 }
  const r = calculate(d)
  const tip = adviceFor(d).find(t => t.id === 'underpriced')
  assert.ok(tip)
  assert.equal(tip.vars.realMargin, Math.round((r.profit / r.cost) * 100))
  assert.equal(tip.vars.margin, 40)
})

test('underpriced is not shown when selling at a loss (the red sentence already says it)', () => {
  assert.ok(!ids({ currentPrice: 2 }).includes('underpriced'))
})

test('0 % failures, free time, thin margin and a high fee each give their tip', () => {
  assert.ok(ids({ failRate: 0 }).includes('noFailures'))
  assert.ok(ids({ hourlyRate: 0 }).includes('freeTime'))
  assert.ok(ids({ margin: 10 }).includes('lowMargin'))
  assert.ok(ids({ fee: 15 }).includes('fee'))
})

test('thin margin: parts needed to pay back one lost part', () => {
  const d = { ...BASE, margin: 10 }
  const r = calculate(d)
  const tip = adviceFor(d).find(t => t.id === 'lowMargin')
  assert.equal(tip.vars.parts, Math.ceil(r.cost / r.recommendedProfit))
})

test('fee: what it takes is the difference with the direct price', () => {
  const d = { ...BASE, fee: 15 }
  const tip = adviceFor(d).find(t => t.id === 'fee')
  const direct = calculate({ ...d, fee: 0 }).recommendedPrice
  assert.ok(Math.abs(tip.vars.direct - direct) < 1e-9)
  assert.ok(Math.abs(tip.vars.takes - (calculate(d).recommendedPrice - direct)) < 1e-9)
})

test('labour-heavy parts are pointed at batching', () => {
  assert.ok(ids({ postMinutes: 60 }).includes('laborHeavy'))
})

test('never more than MAX_TIPS, most important first', () => {
  const tips = adviceFor({ ...BASE, failRate: 0, hourlyRate: 0, margin: 5, fee: 20, currentPrice: 4 })
  assert.ok(tips.length <= MAX_TIPS)
  const p = tips.map(t => t.priority)
  assert.deepEqual(p, [...p].sort((a, b) => a - b))
})

test('an empty form gives no tips and no NaN', () => {
  const zero = Object.fromEntries(Object.keys(BASE).map(k => [k, k === 'extraFilaments' ? [] : 0]))
  assert.deepEqual(adviceFor(zero), [])
})
