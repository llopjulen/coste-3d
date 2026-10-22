/* Tests for the "Your setup" part of backup.js. Run them with:  npm test
   They protect two promises: a backup file made before the setup existed
   still restores, and restoring never wipes numbers the person typed. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  KEYS, BACKUP_SCHEMA_VERSION, sanitizeSetup, buildBackup, parseBackup, planRestore,
  readSetup, saveSetupField, clearSetup, applyRestore, hasStoredSettings,
} from './backup.js'

// A stand-in for localStorage: same three methods, backed by a Map.
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: key => { map.delete(key) },
  }
}
// Storage that refuses everything, like a browser with site data blocked.
const blocked = {
  getItem() { throw new DOMException('blocked', 'SecurityError') },
  setItem() { throw new DOMException('blocked', 'SecurityError') },
  removeItem() { throw new DOMException('blocked', 'SecurityError') },
}

const SETUP = { printerPrice: 700, watts: 110, hourlyRate: 15 }
const quote = { id: 1700000000000, cost: 5, price: 8 }

test('sanitizeSetup keeps finite non-negative numbers and drops the rest', () => {
  assert.deepEqual(
    sanitizeSetup({ watts: 110, fee: '8', kwhPrice: NaN, failRate: -3, margin: 0, hourlyRate: null }),
    { watts: 110, margin: 0 },
  )
})

test('sanitizeSetup returns null for anything that is not a usable map', () => {
  for (const bad of [null, undefined, 5, 'x', [1, 2], {}, { fee: 'no' }]) assert.equal(sanitizeSetup(bad), null)
})

test('the setup survives a backup round trip', () => {
  const file = JSON.stringify(buildBackup({ quotes: [quote], setup: SETUP }))
  assert.deepEqual(parseBackup(file).setup, SETUP)
})

test('a backup made before the setup existed still restores, with setup null', () => {
  // Exactly the shape of a v1 file written by the previous version.
  const old = {
    app: 'layercents', kind: 'backup', schemaVersion: 1, exportedAt: '2026-10-22T08:00:00.000Z',
    data: { savedQuotes: [quote], business: null, quoteCounter: 3 },
  }
  const parsed = parseBackup(JSON.stringify(old))
  assert.equal(parsed.setup, null)
  assert.equal(parsed.quotes.length, 1)
  assert.equal(parsed.counter, 3)
})

test('adding the setup did not change the format version', () => {
  assert.equal(BACKUP_SCHEMA_VERSION, 1)
})

test('merge fills in missing setup fields and never overwrites the ones here', () => {
  const current = { quotes: [], business: null, counter: null, setup: { watts: 200 } }
  const backup = { quotes: [], business: null, counter: null, setup: { watts: 110, fee: 8 } }
  assert.deepEqual(planRestore(current, backup, 'merge').setup, { watts: 200, fee: 8 })
})

test('merge with no setup on either side leaves it empty', () => {
  const empty = { quotes: [], business: null, counter: null, setup: null }
  assert.equal(planRestore(empty, { ...empty }, 'merge').setup, null)
})

test('replace takes the setup of the file', () => {
  const current = { quotes: [], business: null, counter: null, setup: { watts: 200, fee: 3 } }
  const backup = { quotes: [], business: null, counter: null, setup: { watts: 110 } }
  assert.deepEqual(planRestore(current, backup, 'replace').setup, { watts: 110 })
})

test('replace with a file that has no setup keeps the one here', () => {
  const current = { quotes: [], business: null, counter: null, setup: { watts: 200 } }
  const backup = { quotes: [], business: null, counter: null, setup: null }
  assert.deepEqual(planRestore(current, backup, 'replace').setup, { watts: 200 })
})

test('saveSetupField stores only what was edited and merges with what is there', () => {
  const storage = fakeStorage()
  assert.equal(saveSetupField('watts', 150, storage), true)
  assert.equal(saveSetupField('fee', 5, storage), true)
  assert.deepEqual(readSetup(storage), { watts: 150, fee: 5 })
  assert.equal(saveSetupField('watts', 90, storage), true)
  assert.deepEqual(readSetup(storage), { watts: 90, fee: 5 })
})

test('saveSetupField refuses values that cannot be stored and leaves storage alone', () => {
  const storage = fakeStorage({ [KEYS.setup]: JSON.stringify({ watts: 150 }) })
  for (const bad of [-1, NaN, Infinity, '12', null]) assert.equal(saveSetupField('fee', bad, storage), false)
  assert.deepEqual(readSetup(storage), { watts: 150 })
})

test('with blocked storage nothing throws', () => {
  assert.equal(saveSetupField('watts', 150, blocked), false)
  assert.equal(clearSetup(blocked), false)
  assert.equal(hasStoredSettings(blocked), false)
})

test('a damaged stored setup reads as none', () => {
  assert.equal(readSetup(fakeStorage({ [KEYS.setup]: '{not json' })), null)
  assert.equal(readSetup(fakeStorage({ [KEYS.setup]: '[1,2]' })), null)
})

test('clearSetup removes the key', () => {
  const storage = fakeStorage({ [KEYS.setup]: JSON.stringify(SETUP) })
  assert.equal(clearSetup(storage), true)
  assert.equal(readSetup(storage), null)
})

test('a stored setup alone counts as stored settings (so a backup can be downloaded)', () => {
  assert.equal(hasStoredSettings(fakeStorage()), false)
  assert.equal(hasStoredSettings(fakeStorage({ [KEYS.setup]: JSON.stringify(SETUP) })), true)
})

test('applyRestore writes the setup and hands it back for the screen', () => {
  const storage = fakeStorage()
  const backup = parseBackup(JSON.stringify(buildBackup({ quotes: [quote], setup: SETUP })))
  const result = applyRestore(backup, 'merge', [], storage)
  assert.deepEqual(result.setup, SETUP)
  assert.deepEqual(readSetup(storage), SETUP)
})
