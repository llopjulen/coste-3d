/* Tests for cloud/session.js: the contract and the mock. */
import { test } from 'node:test'
import assert from 'node:assert/strict'

// A minimal sessionStorage and location for node.
const store = new Map()
globalThis.sessionStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) }
globalThis.window = { location: { search: '' } }

const { CloudError, adapter, cloudMode, looksLikeEmail, mockAdapter, registerCloudAdapter } = await import('./session.js')

test('off by default: no adapter, nothing shown', () => {
  assert.equal(cloudMode(), 'off')
  assert.equal(adapter(), null)
})

test('?cloud=mock turns the mock on for the tab, ?cloud=off turns it off', () => {
  window.location.search = '?cloud=mock'
  assert.equal(cloudMode(), 'mock')
  window.location.search = ''
  assert.equal(cloudMode(), 'mock', 'remembered for the tab')
  window.location.search = '?cloud=off'
  assert.equal(cloudMode(), 'off')
  window.location.search = ''
})

test('a registered live adapter wins over the mock', () => {
  const fake = { getSession: async () => null }
  registerCloudAdapter(fake)
  assert.equal(cloudMode(), 'live')
  assert.equal(adapter(), fake)
  registerCloudAdapter(null)
})

test('email check: obvious typos only', () => {
  assert.ok(looksLikeEmail('ana@taller.es'))
  assert.ok(looksLikeEmail('  ana@taller.es '))
  assert.ok(!looksLikeEmail('ana@taller'))
  assert.ok(!looksLikeEmail('ana taller@x.es'))
  assert.ok(!looksLikeEmail(''))
})

test('mock: a bad email is refused with a code the screen can translate', async () => {
  await assert.rejects(mockAdapter.sendLink('nope'), e => e instanceof CloudError && e.code === 'email')
})

test('mock: sign in after the link, then sign out, telling listeners', async () => {
  const seen = []
  const stop = mockAdapter.onChange(s => seen.push(s?.email ?? null))
  await mockAdapter.sendLink('ana@taller.es')
  await new Promise(r => setTimeout(r, 1600))
  assert.deepEqual(await mockAdapter.getSession(), { email: 'ana@taller.es' })
  await mockAdapter.signOut()
  assert.equal(await mockAdapter.getSession(), null)
  assert.deepEqual(seen, ['ana@taller.es', null])
  stop()
})
