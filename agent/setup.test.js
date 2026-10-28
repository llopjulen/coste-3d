/* Test of the "add" command, end to end: the real terminal program, with the
   answers typed in and a fake Klipper printer to find. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startFakeMoonraker } from './fakeMoonraker.js'
import { readConfig, configPath } from './config.js'

const SERVER = fileURLToPath(new URL('./server.js', import.meta.url))

/* Runs `node agent/server.js <args>` with `input` typed in. Resolves { code, out }. */
function runAgent(args, input, home) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [SERVER, ...args], { env: { ...process.env, LAYERCENTS_HOME: home } })
    let out = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { out += d })
    child.on('close', code => resolve({ code, out }))
    child.stdin.end(input)
  })
}

test('add: a Klipper printer is found, tested and saved, with the API key in a private file', async () => {
  const fake = await startFakeMoonraker({ apiKey: 'goodkey12345678' })
  const home = mkdtempSync(join(tmpdir(), 'layercents-setup-'))
  try {
    // brand 2, name, model, IP, port, API key
    const { code, out } = await runAgent(['add'], `2\nTaller K2\nK2 Plus\n127.0.0.1\n${fake.port}\ngoodkey12345678\n`, home)
    assert.equal(code, 0, out)
    assert.match(out, /Connected\. Moonraker v0\.9\.3-test\. Klipper is ready\./)
    const { printers } = await readConfig({ LAYERCENTS_HOME: home })
    assert.deepEqual(printers, [{ id: 'taller-k2', name: 'Taller K2', brand: 'moonraker', host: '127.0.0.1', model: 'K2 Plus', port: fake.port, apiKey: 'goodkey12345678' }])
    if (process.platform !== 'win32') assert.equal(statSync(configPath({ LAYERCENTS_HOME: home })).mode & 0o777, 0o600)
    // The key is never echoed back by the program.
    assert.equal(out.includes('goodkey12345678'), false)

    // `list` shows the printer without its key.
    const listed = await runAgent(['list'], '', home)
    assert.match(listed.out, /taller-k2 {2}· {2}Taller K2 \(K2 Plus\) {2}· {2}127\.0\.0\.1 {2}· {2}Klipper, port \d+/)
    assert.equal(listed.out.includes('goodkey'), false)

    // Adding the same address and port again replaces the entry instead of duplicating it.
    await runAgent(['add'], `2\nTaller K2 v2\n\n127.0.0.1\n${fake.port}\ngoodkey12345678\n`, home)
    assert.equal((await readConfig({ LAYERCENTS_HOME: home })).printers.length, 1)
  } finally {
    rmSync(home, { recursive: true, force: true })
    await fake.close()
  }
})

test('add: a wrong API key saves nothing and says why', async () => {
  const fake = await startFakeMoonraker({ apiKey: 'goodkey12345678' })
  const home = mkdtempSync(join(tmpdir(), 'layercents-setup-'))
  try {
    const { code, out } = await runAgent(['add'], `2\nX\n\n127.0.0.1\n${fake.port}\nwrongkey1234567\n`, home)
    assert.equal(code, 1)
    assert.match(out, /asked for an API key and refused/)
    assert.match(out, /Nothing was saved/)
    assert.deepEqual((await readConfig({ LAYERCENTS_HOME: home })).printers, [])
  } finally {
    rmSync(home, { recursive: true, force: true })
    await fake.close()
  }
})

test('add: input that ends halfway cancels without saving', async () => {
  const home = mkdtempSync(join(tmpdir(), 'layercents-setup-'))
  try {
    const { code, out } = await runAgent(['add'], '2\nTaller\n', home)
    assert.equal(code, 1)
    assert.match(out, /Cancelled\. Nothing was saved\./)
    assert.throws(() => readFileSync(configPath({ LAYERCENTS_HOME: home })), { code: 'ENOENT' })
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
