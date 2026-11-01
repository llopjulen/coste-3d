/* ==================================================================
   FTPS PROBE — can the agent log in to a Bambu printer's file server?

   Real grams (docs/IMPRESORAS.md, step 5) come from the .gcode.3mf the
   printer received, and that file is only reachable through FTPS (FTP
   inside TLS from the first byte, "implicit" mode) on port 990. Newer
   firmwares may close that port in normal mode (without LAN only or
   Developer Mode). Before building the download, this finds out, on the
   real printer, with the least possible code: connect, log in, quit.
   It reads nothing and writes nothing on the printer.

   The same rule as the MQTT connection: the certificate's fingerprint
   is checked BEFORE the access code is sent (openPinnedTls), so a
   device pretending to be the printer never receives it.

   Run it with:  npm run agent -- probe-ftps <printer id>
================================================================== */
import { codeError } from './mqtt.js'
import { openPinnedTls } from './drivers/bambu.js'

export const FTPS_PORT = 990
// Bambu printers have a single FTP user.
export const FTPS_USER = 'bblp'

/* Reads FTP replies from a socket, one at a time. A reply is a line
   "230 text", or several lines "230-text" ... "230 text" (RFC 959, 4.2). */
export function replyReader(socket) {
  let buffer = ''
  let pending = null // the promise callbacks of whoever is waiting
  let failure = null
  const lines = []

  const settle = () => {
    if (!pending) return
    if (failure) {
      const { reject } = pending
      pending = null
      return reject(failure)
    }
    // A complete reply ends at a line that starts with the same code and a space.
    const first = lines[0]
    const code = first && /^(\d{3})[ -]/.exec(first)?.[1]
    if (!code) return undefined
    const end = lines.findIndex(l => l.startsWith(`${code} `))
    if (end === -1) return undefined
    const text = lines.splice(0, end + 1).join('\n')
    const { resolve } = pending
    pending = null
    return resolve({ code: Number(code), text })
  }

  socket.on('data', chunk => {
    buffer += chunk.toString('utf8')
    // A line that never ends would grow without limit: a real server doesn't do that.
    if (buffer.length > 16_384) return socket.destroy(codeError('BAD_REPLY', 'the server sent too much text without a line break'))
    const parts = buffer.split(/\r?\n/)
    buffer = parts.pop()
    lines.push(...parts)
    return settle()
  })
  const fail = err => { failure ??= err; settle() }
  socket.on('error', fail)
  socket.on('close', () => fail(codeError('CLOSED', 'the printer closed the connection')))

  return () => new Promise((resolve, reject) => {
    pending = { resolve, reject }
    settle()
  })
}

/* QUIT, then wait (briefly) for the printer to close: destroying the socket
   right after write() could throw the QUIT away before it leaves. */
function goodbye(socket) {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, 500)
    socket.once('close', () => { clearTimeout(timer); resolve() })
    socket.end('QUIT\r\n')
  })
}

/* Connects, logs in and says goodbye.
   Resolves { ok: true } or { ok: false, stage, ... }; it only throws for
   things that are not an answer from the printer (a bug). `stage` says
   how far it got: 'connect' | 'certificate' | 'greeting' | 'login'. */
export async function probeFtps({ host, accessCode, fingerprint, port = FTPS_PORT, timeoutMs = 10_000 }) {
  let socket
  try {
    ;({ socket } = await openPinnedTls({ host, port, expectedFingerprint: fingerprint, timeoutMs }))
  } catch (err) {
    if (err.code === 'CERT_MISMATCH') return { ok: false, stage: 'certificate' }
    return { ok: false, stage: 'connect', code: err.code ?? 'ERROR' }
  }
  const next = replyReader(socket)
  // Each wait for a reply has its own time limit: a silent server must not hang the command.
  const reply = async () => {
    let timer
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(codeError('TIMEOUT', 'no reply')), timeoutMs) })
    try {
      return await Promise.race([next(), timeout])
    } finally {
      clearTimeout(timer)
    }
  }
  let stage = 'greeting'
  try {
    const greeting = await reply()
    if (greeting.code !== 220) return { ok: false, stage: 'greeting', reply: greeting.code }
    stage = 'login'
    socket.write(`USER ${FTPS_USER}\r\n`)
    const user = await reply()
    // 331 = "password please"; 230 = "already in" (a server without a password).
    if (user.code === 230) return { ok: true }
    if (user.code !== 331) return { ok: false, stage: 'login', reply: user.code }
    socket.write(`PASS ${accessCode}\r\n`)
    const pass = await reply()
    await goodbye(socket)
    return pass.code === 230 ? { ok: true } : { ok: false, stage: 'login', reply: pass.code }
  } catch (err) {
    return { ok: false, stage, code: err.code ?? 'ERROR' }
  } finally {
    socket.destroy()
  }
}

/* The outcome, in words for the person running the command. Never prints the access code. */
export function ftpsResultText(result, { host, port = FTPS_PORT }) {
  if (result.ok) return `✓ FTPS works in this mode: the agent can log in to ${host}:${port}.\n  Real grams from the printer (step 5 of the plan) are possible.`
  if (result.stage === 'certificate') return `✗ ${host}:${port} presented a different certificate than the one saved for this printer, so the access code was NOT sent.\n  Tell Claude: it may be that FTPS uses its own certificate.`
  if (result.stage === 'connect') {
    const closed = result.code === 'ECONNREFUSED' || result.code === 'TIMEOUT'
    return `✗ Can't open ${host}:${port} (${result.code}).${closed ? '\n  The printer is on but port 990 is closed or filtered: in this firmware FTPS is probably only open in LAN only / Developer Mode.\n  Plan B: drag the 3MF to layercents.' : ''}`
  }
  if (result.stage === 'login' && result.reply) return `✗ The printer answered the login with ${result.reply}: the access code was refused or FTP login is disabled in this mode.`
  return `✗ The port opened, but the conversation stopped during the ${result.stage} (${result.reply ?? result.code ?? 'no reply'}).${result.stage === 'greeting' ? ' It may not be an FTP server.' : ''}`
}
