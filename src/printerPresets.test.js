/* Tests for printerPresets.js. Run: npm test */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PRINTER_PRESETS, presetById } from './printerPresets.js'

test('every preset has a unique id, a name and a plausible average power', () => {
  const ids = PRINTER_PRESETS.map(p => p.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const p of PRINTER_PRESETS) {
    assert.ok(p.name.length > 0)
    // An average while printing, not the power supply's maximum: a desktop printer sits well under 400 W.
    assert.ok(Number.isFinite(p.watts) && p.watts > 20 && p.watts < 400, p.id)
  }
})

test('looking up a preset: known id, or null for "other" and unknown ids', () => {
  assert.equal(presetById('bambu-p1s').watts, 105)
  assert.equal(presetById(''), null)
  assert.equal(presetById('made-up'), null)
})
