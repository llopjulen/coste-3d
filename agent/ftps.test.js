/* Tests for ftps.js: a pretend FTPS server on a random port, with a
   throwaway certificate (like bambu.test.js, skipped without openssl). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import tls from 'node:tls'
import net from 'node:net'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { X509Certificate } from 'node:crypto'
import { FTPS_USER, ftpsResultText, probeFtps } from './ftps.js'

let hasOpenssl = true
try {
  execFileSync('openssl', ['version'], { stdio: 'ignore' })
} catch {
  hasOpenssl = false
}
const skip = !hasOpenssl && 'openssl not installed'

function makeCertificate() {
  const dir = mkdtempSync(join(tmpdir(), 'layercents-ftps-'))
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=test',
      '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' })
    const cert = readFileSync(join(dir, 'cert.pem'))
    return { key: readFileSync(join(dir, 'key.pem')), cert, fingerprint: new X509Certificate(cert).fingerprint256 }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/* A pretend printer. `script` decides what it says. It records what the client sent. */
function startFtpServer({ key, cert }, { greeting = '220 Bambu FTP ready\r\n', password = 'ABCD1234', multiline = false } = {}) {
  const received = []
  const server = tls.createServer({ key, cert }, socket => {
    socket.on('error', () => {})
    socket.write(multiline ? '220-Welcome\r\n220-to the printer\r\n220 ready\r\n' : greeting)
    let buffer = ''
    socket.on('data', chunk => {
      buffer += chunk.toString()
      let i
      while ((i = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, i)
        buffer = buffer.slice(i + 2)
        received.push(line)
        if (line === `USER ${FTPS_USER}`) socket.write('331 password please\r\n')
        else if (line.startsWith('PASS ')) socket.write(line === `PASS ${password}` ? '230 logged in\r\n' : '530 login incorrect\r\n')
        else if (line === 'QUIT') socket.end('221 bye\r\n')
      }
    })
  })
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, received })))
}

const stop = server => new Promise(resolve => server.close(resolve))

test('ftps: logs in with the right access code, and says goodbye', { skip }, async () => {
  const c = makeCertificate()
  const { server, port, received } = await startFtpServer(c)
  try {
    const result = await probeFtps({ host: '127.0.0.1', port, accessCode: 'ABCD1234', fingerprint: c.fingerprint })
    assert.deepEqual(result, { ok: true })
    assert.deepEqual(received, ['USER bblp', 'PASS ABCD1234', 'QUIT'])
  } finally {
    await stop(server)
  }
})

test('ftps: a multi-line greeting (220-…) is read as one reply', { skip }, async () => {
  const c = makeCertificate()
  const { server, port } = await startFtpServer(c, { multiline: true })
  try {
    assert.deepEqual(await probeFtps({ host: '127.0.0.1', port, accessCode: 'ABCD1234', fingerprint: c.fingerprint }), { ok: true })
  } finally {
    await stop(server)
  }
})

test('ftps: a refused access code is reported as a login failure', { skip }, async () => {
  const c = makeCertificate()
  const { server, port } = await startFtpServer(c)
  try {
    const result = await probeFtps({ host: '127.0.0.1', port, accessCode: 'WRONG123', fingerprint: c.fingerprint })
    assert.deepEqual(result, { ok: false, stage: 'login', reply: 530 })
  } finally {
    await stop(server)
  }
})

test('ftps: a different certificate stops everything BEFORE the access code is sent', { skip }, async () => {
  const c = makeCertificate()
  const other = makeCertificate()
  const { server, port, received } = await startFtpServer(c)
  try {
    const result = await probeFtps({ host: '127.0.0.1', port, accessCode: 'ABCD1234', fingerprint: other.fingerprint })
    assert.deepEqual(result, { ok: false, stage: 'certificate' })
    assert.deepEqual(received, [], 'nothing, not even the user name, reaches an unknown server')
  } finally {
    await stop(server)
  }
})

test('ftps: something that is not an FTP server is reported, not hung on', { skip }, async () => {
  const c = makeCertificate()
  const { server, port } = await startFtpServer(c, { greeting: 'HTTP/1.1 400 Bad Request\r\n' })
  try {
    const result = await probeFtps({ host: '127.0.0.1', port, accessCode: 'ABCD1234', fingerprint: c.fingerprint, timeoutMs: 300 })
    assert.equal(result.ok, false)
    assert.equal(result.stage, 'greeting')
  } finally {
    await stop(server)
  }
})

test('ftps: a closed port is a connect failure (the "FTPS is off in this mode" case)', async () => {
  // Grab a free port and close it again: nothing listens there.
  const free = await new Promise(resolve => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)) })
  })
  const result = await probeFtps({ host: '127.0.0.1', port: free, accessCode: 'ABCD1234', fingerprint: 'AA:BB', timeoutMs: 500 })
  assert.deepEqual(result, { ok: false, stage: 'connect', code: 'ECONNREFUSED' })
  assert.match(ftpsResultText(result, { host: '127.0.0.1' }), /Plan B/)
})

test('ftps: the text never contains the access code', () => {
  for (const r of [{ ok: true }, { ok: false, stage: 'login', reply: 530 }, { ok: false, stage: 'certificate' }, { ok: false, stage: 'greeting', code: 'TIMEOUT' }]) {
    assert.doesNotMatch(ftpsResultText(r, { host: '10.0.0.5' }), /ABCD1234/)
  }
})
