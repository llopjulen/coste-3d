/* Tests for costPrint.js. Run: npm test */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { layerBands } from './costPrint.js'

const L = [{ key: 'a' }, { key: 'b' }, { key: 'c' }]
const count = (bands, i) => bands.filter(b => b === i).length

test('layers are shared out in proportion and always add up to N', () => {
  const bands = layerBands(L, { a: 50, b: 30, c: 20 }, 10)
  assert.deepEqual([count(bands, 0), count(bands, 1), count(bands, 2)], [5, 3, 2])
  assert.equal(layerBands(L, { a: 1, b: 1, c: 1 }, 56).length, 56)
})

test('bands go bottom to top in the fixed order of the parts', () => {
  assert.deepEqual(layerBands(L, { a: 1, b: 1 }, 4), [0, 0, 1, 1])
})

test('a tiny part still gets one layer; a part with no cost gets none', () => {
  const bands = layerBands(L, { a: 999, b: 1, c: 0 }, 20)
  assert.equal(count(bands, 1), 1)
  assert.equal(count(bands, 2), 0)
  assert.equal(bands.length, 20)
})

test('no cost, or nonsense, is an empty object instead of a crash', () => {
  assert.deepEqual(layerBands(L, { a: 0 }, 10), [])
  assert.deepEqual(layerBands(L, null, 10), [])
  assert.deepEqual(layerBands(L, { a: -5, b: NaN }, 10), [])
})
