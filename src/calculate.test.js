/* Tests for calculate.js. Run them with:  npm test */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_EXTRA_FILAMENTS, calculate, materialCost, normalizeExtras, pricePerGram, totalGrams } from './calculate.js'

// The calculator's defaults (INITIAL in App.jsx).
const BASE = {
  spoolPrice: 20, spoolWeight: 1000, partGrams: 45, purgeGrams: 0,
  hours: 3.5, postMinutes: 10, packaging: 0.8, quantity: 1, currentPrice: 12,
  printerPrice: 700, lifespan: 3000, watts: 110, kwhPrice: 0.15, failRate: 8,
  hourlyRate: 15, fee: 8, margin: 40,
}
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} ${a} vs ${b}`)

test('with no extra filaments the numbers are the ones the calculator always gave', () => {
  const r = calculate(BASE)
  near(r.parts.material, 0.9)
  near(r.parts.power, 0.11 * 3.5 * 0.15)
  near(r.parts.depreciation, 3.5 * 700 / 3000)
  near(r.parts.labor, 2.5)
  near(r.cost, r.parts.material + r.parts.power + r.parts.depreciation + r.parts.failures + r.parts.labor + 0.8)
  // An old saved quote has no extraFilaments at all: same result as an empty list.
  assert.deepEqual(calculate({ ...BASE, extraFilaments: [] }), r)
})

test('every extra filament adds its grams at its own price per gram', () => {
  const extra = [
    { id: 1, label: 'PETG', spoolPrice: 30, spoolWeight: 750, grams: 10 }, // 0.04 per g
    { id: 2, label: '', spoolPrice: 12, spoolWeight: 500, grams: 5 },      // 0.024 per g
  ]
  near(materialCost({ ...BASE, extraFilaments: extra }), 0.9 + 10 * 0.04 + 5 * 0.024)
  // Material feeds the failure share too, so the whole cost moves with it.
  assert.ok(calculate({ ...BASE, extraFilaments: extra }).cost > calculate(BASE).cost)
})

test('the purge is priced at the first filament', () => {
  near(materialCost({ ...BASE, purgeGrams: 10, extraFilaments: [{ spoolPrice: 100, spoolWeight: 1000, grams: 0 }] }), 55 * 0.02)
})

test('a spool with no weight costs nothing instead of NaN or Infinity', () => {
  assert.equal(pricePerGram(20, 0), 0)
  assert.equal(pricePerGram(20, -5), 0)
  assert.equal(pricePerGram(Number.NaN, 1000), 0)
  const r = calculate({ ...BASE, extraFilaments: [{ spoolPrice: 20, spoolWeight: 0, grams: 50 }] })
  assert.ok(Number.isFinite(r.cost))
  near(r.parts.material, 0.9)
})

test('broken extras are ignored, not thrown on', () => {
  const r = calculate({ ...BASE, extraFilaments: [null, 'x', 5, { grams: 'ten', spoolPrice: 20, spoolWeight: 1000 }, { grams: 10, spoolPrice: 20, spoolWeight: 1000 }] })
  near(r.parts.material, 0.9 + 0.2)
  assert.equal(calculate({ ...BASE, extraFilaments: 'nope' }).cost, calculate(BASE).cost)
})

test('totalGrams adds the first filament, the purge and the extras', () => {
  assert.equal(totalGrams({ partGrams: 40, purgeGrams: 5, extraFilaments: [{ grams: 10 }, { grams: 2.5 }] }), 57.5)
  assert.equal(totalGrams({ partGrams: 40, purgeGrams: 5 }), 45)
  assert.equal(totalGrams(undefined), 0)
})

test('normalizeExtras: clean shape, sequential ids, no negatives, a cap', () => {
  const clean = normalizeExtras([{ id: 9, label: 'PLA', spoolPrice: 20, spoolWeight: 1000, grams: 3 }, { id: 9, spoolPrice: -1, spoolWeight: 'a', grams: Number.NaN, label: 7 }, null])
  assert.deepEqual(clean, [
    { id: 1, label: 'PLA', spoolPrice: 20, spoolWeight: 1000, grams: 3 },
    { id: 2, label: '', spoolPrice: 0, spoolWeight: 0, grams: 0 },
  ])
  assert.deepEqual(normalizeExtras(undefined), [])
  assert.equal(normalizeExtras(Array.from({ length: 50 }, () => ({}))).length, MAX_EXTRA_FILAMENTS)
  assert.equal(normalizeExtras([{ label: 'x'.repeat(500) }])[0].label.length, 40)
})
