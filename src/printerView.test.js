/* Tests for printerView.js. Run them with:  npm test */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detailLine, fmtMinutes, percent, tone } from './printerView.js'

test('fmtMinutes: hours and minutes the way people say them', () => {
  assert.equal(fmtMinutes(45), '45 min')
  assert.equal(fmtMinutes(75), '1 h 15 min')
  assert.equal(fmtMinutes(120), '2 h')
  assert.equal(fmtMinutes(0), 'less than a minute')
  assert.equal(fmtMinutes(null), null)
  assert.equal(fmtMinutes(-5), null)
})

test('percent: rounded, clamped, and null when unknown', () => {
  assert.equal(percent(0.423), 42)
  assert.equal(percent(1.4), 100)
  assert.equal(percent(null), null)
  assert.equal(percent(Number.NaN), null)
})

test('tone: gold while working, red on failure, grey when we cannot tell', () => {
  assert.equal(tone({ connection: 'online', state: 'printing' }), 'busy')
  assert.equal(tone({ connection: 'online', state: 'idle' }), 'ok')
  assert.equal(tone({ connection: 'online', state: 'failed' }), 'bad')
  assert.equal(tone({ connection: 'auth-error', state: 'unknown' }), 'bad')
  assert.equal(tone({ connection: 'offline', state: 'printing' }), 'muted')
})

test('detailLine: only the facts that are known', () => {
  assert.equal(detailLine({ job: { layer: 120, totalLayers: 300 }, temps: { nozzle: 219.6, bed: 60 } }), 'Layer 120 of 300 · Nozzle 220 °C · Bed 60 °C')
  assert.equal(detailLine({ job: null, temps: { nozzle: 25, bed: null } }), 'Nozzle 25 °C')
  assert.equal(detailLine({ job: { layer: 0, totalLayers: 0 }, temps: {} }), '')
})
