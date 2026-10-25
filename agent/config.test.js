/* Tests for config.js and the small helpers of setup.js and printers.js.
   Each test uses its own temporary folder through LAYERCENTS_HOME, so the
   real ~/.layercents is never touched. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkPrinter, configPath, readConfig, writeConfig } from './config.js'
import { probeErrorText, slugify } from './setup.js'
import { createPrinters } from './printers.js'

const GOOD = {
  id: 'p1s-taller', name: 'P1S taller', brand: 'bambu', model: 'P1S', host: '192.168.1.50',
  serial: '01P00A123456789', accessCode: '12345678', fingerprint: 'AB:'.repeat(31) + 'AB',
}

/* A fresh, empty LAYERCENTS_HOME for one test. */
function tempHome() {
  const dir = mkdtempSync(join(tmpdir(), 'layercents-home-'))
  return { env: { LAYERCENTS_HOME: dir }, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

test('no config file yet means no printers, not an error', async () => {
  const { env, cleanup } = tempHome()
  try {
    assert.deepEqual(await readConfig(env), { printers: [], skipped: [] })
  } finally {
    cleanup()
  }
})

test('printers survive a save and load, in a file only its owner can read', async () => {
  const { env, cleanup } = tempHome()
  try {
    await writeConfig([GOOD], env)
    assert.deepEqual((await readConfig(env)).printers, [GOOD])
    // 600 = read and write for the owner only. Windows doesn't use these bits.
    if (process.platform !== 'win32') assert.equal(statSync(configPath(env)).mode & 0o777, 0o600)
  } finally {
    cleanup()
  }
})

test('a broken entry is skipped with its reason, and the others still load', async () => {
  const { env, cleanup } = tempHome()
  try {
    mkdirSync(env.LAYERCENTS_HOME, { recursive: true })
    writeFileSync(configPath(env), JSON.stringify({ version: 1, printers: [GOOD, { ...GOOD, id: 'bad', accessCode: '123' }] }))
    const { printers, skipped } = await readConfig(env)
    assert.deepEqual(printers.map(p => p.id), ['p1s-taller'])
    assert.deepEqual(skipped, [{ id: 'bad', reason: 'access code must be 8 letters or digits' }])
  } finally {
    cleanup()
  }
})

test('a file that is not JSON gives a message that says which file', async () => {
  const { env, cleanup } = tempHome()
  try {
    mkdirSync(env.LAYERCENTS_HOME, { recursive: true })
    writeFileSync(configPath(env), '{ not json')
    await assert.rejects(readConfig(env), err => err.message.includes(configPath(env)))
  } finally {
    cleanup()
  }
})

test('checkPrinter: every field is checked, so a hand-edited file cannot inject anything odd', () => {
  const bad = changes => checkPrinter({ ...GOOD, ...changes }).printer
  assert.ok(checkPrinter(GOOD).printer)
  assert.ok(checkPrinter({ ...GOOD, host: 'printer.local' }).printer)
  assert.equal(bad({ host: '192.168.1.50/evil' }), null)
  assert.equal(bad({ host: 'http://x' }), null)
  assert.equal(bad({ serial: '01p00a123456789' }), null) // lowercase: not how printers show it
  assert.equal(bad({ accessCode: '1234567' }), null)
  assert.equal(bad({ fingerprint: 'nope' }), null)
  assert.equal(bad({ fingerprint: undefined }), null)
  assert.equal(bad({ id: 'Has Spaces' }), null)
  assert.equal(bad({ brand: 'prusa' }), null) // not supported yet
  // Unknown extra fields are dropped, not carried along.
  assert.equal('extra' in checkPrinter({ ...GOOD, extra: 1 }).printer, false)
})

test('slugify: a readable name becomes a safe id', () => {
  assert.equal(slugify('P1S del Taller'), 'p1s-del-taller')
  assert.equal(slugify('Impresora Ñandú #2'), 'impresora-nandu-2')
  assert.equal(slugify('!!!'), 'printer')
})

test('probeErrorText: each failure says what to check', () => {
  const where = { host: '192.168.1.50', serial: 'X' }
  assert.match(probeErrorText({ code: 'CONNECT_REFUSED' }, where), /access code/)
  assert.match(probeErrorText({ code: 'NO_REPORT' }, where), /serial number/)
  assert.match(probeErrorText({ code: 'ECONNREFUSED', message: 'refused' }, where), /192\.168\.1\.50:8883/)
})

test('createPrinters: one driver per printer, started and stopped together', () => {
  const calls = []
  const fake = printer => ({
    start: () => calls.push(`start ${printer.id}`),
    stop: () => calls.push(`stop ${printer.id}`),
    status: () => ({ id: printer.id }),
  })
  const printers = createPrinters([GOOD, { ...GOOD, id: 'x1c' }], { drivers: { bambu: fake } })
  printers.start()
  assert.deepEqual(printers.list(), [{ id: 'p1s-taller' }, { id: 'x1c' }])
  printers.stop()
  assert.deepEqual(calls, ['start p1s-taller', 'start x1c', 'stop p1s-taller', 'stop x1c'])
})
