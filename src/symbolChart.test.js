/* Tests for symbolChart.js. Run them with:  npm test
   They protect one promise: the symbol never lies. The length painted for
   each cost must be proportional to its share of the total. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { printOrder, symbolPieces } from './symbolChart.js'
import { FULL } from './logoGeometry.js'

const KEYS = ['material', 'power', 'depreciation', 'failures', 'labor', 'packaging']
// The phone-stand example from the design: cost 5.22.
const STAND = { material: 0.90, power: 0.06, depreciation: 0.82, failures: 0.14, labor: 2.50, packaging: 0.80 }

const LENGTH = FULL.reduce((sum, [, , width]) => sum + width, 0) // 215.08

// Total painted length of one cost across all layers.
const painted = (result, key) => result.reduce((sum, seg) => sum + seg.pieces[key].width, 0)

test('layers are printed bottom row first, left before right', () => {
  const order = printOrder()
  assert.equal(order.length, 11)
  assert.deepEqual([order[0].x, order[0].y], [29.4, 80.69]) // bottom-left
  assert.deepEqual([order[1].x, order[1].y], [55.1, 80.69]) // bottom-right
  assert.equal(order[10].y, 12.11)                           // last one is the top row
})

test('printOrder does not modify the original geometry', () => {
  const before = JSON.stringify(FULL)
  printOrder()
  assert.equal(JSON.stringify(FULL), before)
})

test('with no gap, each cost gets exactly its share of the total length', () => {
  const result = symbolPieces(STAND, KEYS, { gap: 0 })
  const total = Object.values(STAND).reduce((a, b) => a + b, 0)
  for (const key of KEYS) {
    const expected = (STAND[key] / total) * LENGTH
    assert.ok(Math.abs(painted(result, key) - expected) < 1e-6, `${key} is not proportional`)
  }
})

test('the pieces fill the symbol completely: no hairline left at the end', () => {
  const result = symbolPieces(STAND, KEYS, { gap: 0 })
  const all = KEYS.reduce((sum, key) => sum + painted(result, key), 0)
  assert.ok(Math.abs(all - LENGTH) < 1e-6)
})

test('one single cost paints every layer from end to end', () => {
  const result = symbolPieces({ material: 3 }, KEYS)
  for (const seg of result) {
    assert.equal(seg.pieces.material.from, 0)
    assert.ok(Math.abs(seg.pieces.material.width - seg.width) < 1e-9)
  }
  assert.equal(painted(result, 'power'), 0)
})

test('a layer shared by two costs gets two pieces with a gap between them', () => {
  // 50/50 split: the boundary falls at 107.54, inside one of the layers.
  const result = symbolPieces({ material: 1, power: 1 }, KEYS, { gap: 0.6 })
  const shared = result.filter(s => s.pieces.material.width > 0 && s.pieces.power.width > 0)
  assert.equal(shared.length, 1)
  const { material, power } = shared[0].pieces
  const space = power.from - (material.from + material.width)
  assert.ok(Math.abs(space - 0.6) < 1e-9, `gap was ${space}`)
})

test('the outer ends of a layer are never trimmed by the gap', () => {
  const result = symbolPieces(STAND, KEYS, { gap: 0.6 })
  // The very first layer starts with material at 0, the very last ends at its width.
  assert.equal(result[0].pieces.material.from, 0)
  const last = result[result.length - 1]
  assert.ok(Math.abs(last.pieces.packaging.from + last.pieces.packaging.width - last.width) < 1e-9)
})

test('costs are printed in the order given: material first, packaging last', () => {
  const result = symbolPieces(STAND, KEYS)
  assert.ok(result[0].pieces.material.width > 0)          // bottom layer: material
  assert.equal(result[0].pieces.packaging.width, 0)
  assert.ok(result[10].pieces.packaging.width > 0)        // top layer: packaging
  assert.equal(result[10].pieces.material.width, 0)
})

test('zero, negative, NaN or missing costs paint nothing and do not break the rest', () => {
  const messy = { material: 2, power: 0, depreciation: -5, failures: NaN, labor: 2 /* packaging missing */ }
  const result = symbolPieces(messy, KEYS, { gap: 0 })
  assert.equal(painted(result, 'power'), 0)
  assert.equal(painted(result, 'depreciation'), 0)
  assert.equal(painted(result, 'failures'), 0)
  assert.equal(painted(result, 'packaging'), 0)
  assert.ok(Math.abs(painted(result, 'material') - LENGTH / 2) < 1e-6)
  assert.ok(Math.abs(painted(result, 'labor') - LENGTH / 2) < 1e-6)
})

test('with no cost at all, nothing is painted and nothing divides by zero', () => {
  const result = symbolPieces({}, KEYS)
  assert.equal(result.length, 11)
  for (const key of KEYS) assert.equal(painted(result, key), 0)
})

test('every cost has an entry in every layer, so the component can animate them', () => {
  const result = symbolPieces(STAND, KEYS)
  for (const seg of result) assert.deepEqual(Object.keys(seg.pieces), KEYS)
})
