/* Tests for money.js. Run: npm test */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toDisplay, fromDisplay, currencySymbol } from './money.js'

test('with EUR (rate 1) nothing changes: the form behaves as it always did', () => {
  for (const v of [0, 0.15, 0.8, 20, 700, 1234.5]) {
    assert.equal(toDisplay(v, 1), v)
    assert.equal(fromDisplay(v, 1), v)
  }
})

test('an amount in EUR is shown converted, without float noise', () => {
  assert.equal(toDisplay(20, 1.0923), 21.846)
  assert.equal(toDisplay(0.15, 1.0923), 0.1638)
  assert.equal(toDisplay(700, 155.4), 108780)
})

test('what you type comes back identical: no field jumps while typing', () => {
  // The input is controlled: it shows toDisplay(fromDisplay(typed)). If that differed from
  // what was typed, React would rewrite the field under the person's fingers.
  for (const rate of [1.0923, 0.8617, 155.4, 7.4601, 1.5342, 0.0064]) {
    for (const typed of [0, 1, 2.5, 8, 12.99, 20, 21.8, 0.16, 0.163, 0.1638, 99.9999, 700, 1500.25]) {
      assert.equal(toDisplay(fromDisplay(typed, rate), rate), typed, `rate ${rate}, typed ${typed}`)
    }
  }
})

test('a missing, zero, negative or broken rate falls back to 1 instead of Infinity or NaN', () => {
  for (const rate of [undefined, null, 0, -2, NaN, Infinity, '1.1']) {
    assert.equal(toDisplay(20, rate), 20)
    assert.equal(fromDisplay(20, rate), 20)
  }
})

test('broken numbers become 0, never NaN', () => {
  assert.equal(toDisplay(NaN, 1.1), 0)
  assert.equal(toDisplay(undefined, 1.1), 0)
  assert.equal(fromDisplay(NaN, 1.1), 0)
})

test('currency symbols follow the currency, in the language of the page', () => {
  assert.equal(currencySymbol('EUR', 'en'), '€')
  assert.equal(currencySymbol('USD', 'en'), '$')
  assert.equal(currencySymbol('GBP', 'en'), '£')
  assert.equal(currencySymbol('NOPE', 'en'), 'NOPE')
})
