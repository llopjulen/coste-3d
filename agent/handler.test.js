/* Tests for handler.js. Run them with:  npm test
   node:test and node:assert are built into Node: no dependency needed.
   Each test sends a real HTTP request to a server on a throwaway port. */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request } from 'node:http'
import { createHandler, PROTOCOL, VERSION } from './handler.js'

const STARTED = new Date('2026-10-22T08:00:00Z')
let server
let port

// Port 0 asks the operating system for any free port, so the tests never
// clash with a real agent running on 31415.
before(async () => {
  server = createServer(createHandler({ startedAt: STARTED }))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  port = server.address().port
})

after(() => new Promise(resolve => server.close(resolve)))

/* One request with full control of the headers. node:http is used instead
   of fetch because fetch doesn't let you set Host, and Host is tested here. */
function call({ method = 'GET', path = '/health', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', chunk => { body += chunk })
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, json: body ? JSON.parse(body) : null }))
      },
    )
    req.on('error', reject)
    req.end()
  })
}

test('the live site gets the health answer and may read it (CORS)', async () => {
  const res = await call({ headers: { origin: 'https://layercents.com' } })
  assert.equal(res.status, 200)
  assert.equal(res.headers['access-control-allow-origin'], 'https://layercents.com')
  assert.equal(res.headers['cache-control'], 'no-store')
  assert.deepEqual(res.json, {
    app: 'layercents-agent', version: VERSION, protocol: PROTOCOL,
    startedAt: STARTED.toISOString(), printers: [],
  })
})

test('without Origin (curl, the address typed in the browser) it answers, with no CORS header', async () => {
  const res = await call()
  assert.equal(res.status, 200)
  assert.equal(res.headers['access-control-allow-origin'], undefined)
})

test('the local dev server is allowed too', async () => {
  const res = await call({ headers: { origin: 'http://localhost:5173' } })
  assert.equal(res.status, 200)
  assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173')
})

test('any other website is refused before anything runs', async () => {
  const res = await call({ headers: { origin: 'https://evil.example' } })
  assert.equal(res.status, 403)
  assert.equal(res.headers['access-control-allow-origin'], undefined)
})

test('a foreign Host header (DNS rebinding) is refused, even from an allowed origin', async () => {
  const res = await call({ headers: { host: `evil.example:${port}`, origin: 'https://layercents.com' } })
  assert.equal(res.status, 403)
  assert.deepEqual(res.json, { error: 'host not allowed' })
})

test('localhost works as a Host name as well as 127.0.0.1', async () => {
  const res = await call({ headers: { host: `localhost:${port}` } })
  assert.equal(res.status, 200)
})

test('preflight answers Private Network Access only when asked', async () => {
  const asked = await call({
    method: 'OPTIONS',
    headers: { origin: 'https://layercents.com', 'access-control-request-method': 'GET', 'access-control-request-private-network': 'true' },
  })
  assert.equal(asked.status, 204)
  assert.equal(asked.headers['access-control-allow-origin'], 'https://layercents.com')
  assert.equal(asked.headers['access-control-allow-private-network'], 'true')
  const notAsked = await call({ method: 'OPTIONS', headers: { origin: 'https://layercents.com' } })
  assert.equal(notAsked.headers['access-control-allow-private-network'], undefined)
})

test('unknown paths are 404 and other methods on /health are 405, both as JSON', async () => {
  const missing = await call({ path: '/nope' })
  assert.equal(missing.status, 404)
  assert.deepEqual(missing.json, { error: 'not found' })
  const post = await call({ method: 'POST' })
  assert.equal(post.status, 405)
  assert.equal(post.headers.allow, 'GET, OPTIONS')
})

test('a query string does not change the route', async () => {
  const res = await call({ path: '/health?from=test' })
  assert.equal(res.status, 200)
})
