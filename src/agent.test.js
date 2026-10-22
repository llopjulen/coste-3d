/* Tests for agent.js, run with `npm test` like the agent's own tests.
   checkAgent is tested against the REAL agent code (agent/handler.js) on
   a throwaway port: if one side changes its contract without the other,
   these tests fail before anyone notices it in the browser. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHandler, PROTOCOL, VERSION } from '../agent/handler.js'
import { AGENT_PROTOCOL, checkAgent, consumeAgentOptIn, isAgentEnabled, setAgentEnabled } from './agent.js'

/* Starts a server with the given handler on a free port; returns its URL and a stop function. */
async function serve(handler) {
  const server = createServer(handler)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  return { url, stop: () => new Promise(resolve => server.close(resolve)) }
}

/* A handler that always answers the same JSON, to play other programs on the port. */
const answering = (status, body) => (req, res) => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(typeof body === 'string' ? body : JSON.stringify(body))
}

/* A Map with the three localStorage methods the code uses. */
function fakeStorage() {
  const map = new Map()
  return { map, getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) }
}

test('the web app and the agent speak the same protocol version', () => {
  assert.equal(AGENT_PROTOCOL, PROTOCOL)
})

test('checkAgent: the real agent is reported as connected, with its version', async () => {
  const { url, stop } = await serve(createHandler())
  try {
    const result = await checkAgent({ url })
    assert.equal(result.status, 'connected')
    assert.equal(result.info.version, VERSION)
  } finally {
    await stop()
  }
})

test('checkAgent: our agent with another protocol is reported as outdated', async () => {
  const { url, stop } = await serve(answering(200, { app: 'layercents-agent', protocol: 999, version: '9.9.9' }))
  try {
    assert.equal((await checkAgent({ url })).status, 'outdated')
  } finally {
    await stop()
  }
})

test('checkAgent: another program on the port is reported as wrong, JSON or not', async () => {
  const other = await serve(answering(200, { hello: 'world' }))
  const html = await serve(answering(500, '<html>oops</html>'))
  try {
    assert.equal((await checkAgent({ url: other.url })).status, 'wrong')
    const result = await checkAgent({ url: html.url })
    assert.equal(result.status, 'wrong')
    assert.equal(result.httpStatus, 500)
  } finally {
    await other.stop()
    await html.stop()
  }
})

test('checkAgent: nothing listening is reported as offline, without throwing', async () => {
  // Open a port and close it straight away: now it's guaranteed to be free.
  const { url, stop } = await serve(answering(200, {}))
  await stop()
  assert.deepEqual(await checkAgent({ url }), { status: 'offline' })
})

test('opt-in: stored as "1", removed when turned off, false when storage is blocked', () => {
  const storage = fakeStorage()
  assert.equal(isAgentEnabled(storage), false)
  setAgentEnabled(true, storage)
  assert.equal(storage.map.get('agentEnabled'), '1')
  assert.equal(isAgentEnabled(storage), true)
  setAgentEnabled(false, storage)
  assert.equal(storage.map.has('agentEnabled'), false)
  const blocked = { getItem() { throw new Error('SecurityError') } }
  assert.equal(isAgentEnabled(blocked), false)
})

test('?agent turns the tab on and is removed from the address, keeping the rest', () => {
  const storage = fakeStorage()
  const calls = []
  const history = { replaceState: (...args) => calls.push(args) }
  const location = { pathname: '/', search: '?agent&utm_source=reddit', hash: '#top' }
  assert.equal(consumeAgentOptIn(location, history, storage), true)
  assert.equal(isAgentEnabled(storage), true)
  assert.deepEqual(calls, [[null, '', '/?utm_source=reddit#top']])
})

test('without ?agent nothing changes', () => {
  const storage = fakeStorage()
  const calls = []
  const result = consumeAgentOptIn({ pathname: '/', search: '?x=1', hash: '' }, { replaceState: (...a) => calls.push(a) }, storage)
  assert.equal(result, false)
  assert.equal(calls.length, 0)
  assert.equal(storage.map.size, 0)
})
