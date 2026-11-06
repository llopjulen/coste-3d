/* Tests for route.js: the open screen in the URL. Run: npm test */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSearch, parseRoute } from './route.js'

test('no view, or an unknown one, is the calculator', () => {
  assert.deepEqual(parseRoute(''), { view: 'calculator', open: null })
  assert.deepEqual(parseRoute('?view=admin'), { view: 'calculator', open: null })
})

test('a tab and an order or customer page inside Orders', () => {
  assert.deepEqual(parseRoute('?view=calendar'), { view: 'calendar', open: null })
  assert.deepEqual(parseRoute('?view=orders&order=0a00-1'), { view: 'orders', open: { kind: 'order', id: '0a00-1' } })
  assert.deepEqual(parseRoute('?view=orders&customer=c1'), { view: 'orders', open: { kind: 'customer', id: 'c1' } })
})

test('ids that are not plain ids are ignored, never trusted', () => {
  assert.equal(parseRoute('?view=orders&order=<script>').open, null)
  assert.equal(parseRoute('?view=history&order=abc').open, null)
})

test('building keeps other parameters and drops the old screen', () => {
  assert.equal(buildSearch('?agent', { view: 'orders', open: { kind: 'order', id: 'x1' } }), '?agent=&view=orders&order=x1')
  assert.equal(buildSearch('?view=orders&order=x1', { view: 'calculator' }), '')
  assert.equal(buildSearch('', { view: 'plans', open: { kind: 'order', id: 'x' } }), '?view=plans')
})

test('round trip: what is built is what is read back', () => {
  const route = { view: 'orders', open: { kind: 'customer', id: 'abc-123' } }
  assert.deepEqual(parseRoute(buildSearch('', route)), route)
})
