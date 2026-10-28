/* ==================================================================
   LOCAL AGENT — what it answers to each HTTP request.

   The agent is a small program that runs on a computer on the same
   network as the printers. The web app can't reach a printer itself:
   browsers only speak MQTT over WebSocket, which printers don't offer,
   and an https page can't call an http address on the local network.
   So the agent talks to the printers, and the web app asks the agent
   at http://127.0.0.1.

   This file only decides the answers. It never opens a port: server.js
   does that and hands every request here, so the tests can run the
   same code on a throwaway port.
================================================================== */
import { NO_PRINTERS } from './printers.js'
import { NO_JOBS } from './jobs.js'

// Version of the agent's API contract. The web app updates itself on
// every deploy, but each person's agent only changes when they update
// it, so the two can disagree. With this number the web app can say
// "update your agent" instead of failing in strange ways.
// 2: GET /printers added (live printer status); /health no longer lists printers.
// 3: GET /jobs added (the job log); a printer's job now carries `id`.
export const PROTOCOL = 3

// The build of the agent, shown in /health and on the web app's screen.
export const VERSION = '0.3.0'

// The only web pages allowed to use the agent: the live site and the
// local dev servers (npm run dev uses 5173, npm run preview uses 4173).
// Any other website open in the same browser is refused, so it can't
// read printer data through this person's agent.
export const ALLOWED_ORIGINS = new Set([
  'https://layercents.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
])

/* Writes a JSON answer with the headers every answer shares. */
function send(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    // Declared explicitly, so no browser tries to guess the type.
    'Content-Type': 'application/json; charset=utf-8',
    // Forbids that guessing (MIME sniffing) altogether.
    'X-Content-Type-Options': 'nosniff',
    // Printer status changes every second: a cached copy would be stale.
    'Cache-Control': 'no-store',
    ...extraHeaders,
  })
  res.end(JSON.stringify(body))
}

/* True if the request was addressed to this computer by name.
   Defence against DNS rebinding: a malicious site can make its own
   domain resolve to 127.0.0.1, and the browser then treats the agent
   as part of that site, so CORS no longer applies. Those requests still
   carry the attacker's domain in the Host header, which is checked here. */
function hostIsLocal(req) {
  // The port the request actually arrived on, so the check also works on the test's throwaway port.
  const port = req.socket.localPort
  return req.headers.host === `127.0.0.1:${port}` || req.headers.host === `localhost:${port}`
}

/* Returns the function Node calls for every request. `startedAt` and
   `printers` are passed in, not created here, so tests can fix the clock
   and use fake printers and a fake job log. */
export function createHandler({ startedAt = new Date(), printers = NO_PRINTERS, jobs = NO_JOBS } = {}) {
  return (req, res) => {
    // Checked before anything else: a rebinding attack must get nothing at all.
    if (!hostIsLocal(req)) return send(res, 403, { error: 'host not allowed' })

    // Browsers send Origin on every cross-site request. Without one, the caller
    // isn't another website: curl, a script on this computer, or the address
    // typed straight into the browser bar.
    const origin = req.headers.origin
    // An unknown site is refused here, server-side. CORS alone only stops
    // the page from READING the answer; the request itself would still run,
    // and later endpoints will do more than read.
    if (origin !== undefined && !ALLOWED_ORIGINS.has(origin)) {
      return send(res, 403, { error: 'origin not allowed' })
    }
    // Tells the browser that this page may read the answer. Vary: the
    // header depends on who asked, so no cache may reuse it for someone else.
    const cors = origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}

    // Preflight: before some requests the browser asks for permission with
    // OPTIONS. No body, so it's written by hand instead of with send().
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...cors,
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
        // Chrome's Private Network Access: when a public https page calls an
        // address on this computer, the preflight carries this question, and
        // answering "true" says this server expects such calls.
        ...(req.headers['access-control-request-private-network'] === 'true'
          ? { 'Access-Control-Allow-Private-Network': 'true' }
          : {}),
        // The browser can reuse this permission for 10 minutes instead of asking every time.
        'Access-Control-Max-Age': '600',
      })
      return res.end()
    }

    // Only the path decides the route; any ?query is ignored. The base is
    // required by the URL parser and is never contacted.
    const { pathname } = new URL(req.url, 'http://127.0.0.1')

    if (pathname === '/health') {
      // Allow lists what does work, as HTTP asks for every 405.
      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' }, { ...cors, Allow: 'GET, OPTIONS' })
      return send(res, 200, {
        // The web app checks this name: proof that it's our agent answering
        // on this port and not some other program.
        app: 'layercents-agent',
        version: VERSION,
        protocol: PROTOCOL,
        startedAt: startedAt.toISOString(),
      }, cors)
    }

    if (pathname === '/printers') {
      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' }, { ...cors, Allow: 'GET, OPTIONS' })
      // The common status of each printer (see printerStatus in drivers/bambu.js).
      // Read-only on purpose: nothing here can change a printer or the config.
      return send(res, 200, { printers: printers.list() }, cors)
    }

    if (pathname === '/jobs') {
      if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' }, { ...cors, Allow: 'GET, OPTIONS' })
      // Newest first, at most LIST_LIMIT. Read-only like /printers.
      return send(res, 200, { jobs: jobs.list() }, cors)
    }

    // Any other path: JSON too, so the web app never has to parse an HTML error page.
    return send(res, 404, { error: 'not found' }, cors)
  }
}
