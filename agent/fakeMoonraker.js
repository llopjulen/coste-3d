/* ==================================================================
   FAKE MOONRAKER — a pretend Klipper printer, used only by the tests.

   A real HTTP server on a throwaway port that answers the three paths the
   driver uses, with data the test sets. It also records every request, so
   tests can check what the agent sent (for example the API key header).

   Not named *.test.js on purpose: `node --test` would run it as a test.
================================================================== */
import { createServer } from 'node:http'

/* Options:
   apiKey   require this X-Api-Key (otherwise 401), or null for an open printer
   Mutable on the returned object, so a test can change the printer mid-way:
   stats / display / sdcard / extruder / bed   Klipper objects
   history      the "jobs" array of /server/history/list
   klippyDown   true = answer 503 like Moonraker without Klipper
   redirectTo   a URL = answer 302 to it
   bigBody      true = answer a body over the agent's limit */
export async function startFakeMoonraker({ apiKey = null } = {}) {
  const fake = {
    requests: [],
    apiKey,
    klippyDown: false,
    redirectTo: null,
    bigBody: false,
    stats: { state: 'standby', filename: '', print_duration: 0, message: '' },
    display: { progress: 0 },
    sdcard: { progress: 0 },
    extruder: { temperature: 24.5 },
    bed: { temperature: 23.1 },
    history: [],
  }

  const server = createServer((req, res) => {
    fake.requests.push({ url: req.url, headers: req.headers })
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
      res.end(typeof body === 'string' ? body : JSON.stringify(body))
    }
    if (fake.redirectTo) return send(302, '', { Location: fake.redirectTo })
    if (fake.apiKey && req.headers['x-api-key'] !== fake.apiKey) return send(401, { error: 'Unauthorized' })
    if (fake.bigBody) return send(200, ' '.repeat(2_100_000))
    const { pathname } = new URL(req.url, 'http://x')

    if (pathname === '/server/info') {
      return send(200, { result: { klippy_state: fake.klippyDown ? 'disconnected' : 'ready', moonraker_version: 'v0.9.3-test' } })
    }
    if (fake.klippyDown) return send(503, { error: { code: 503, message: 'Klippy Host not connected' } })
    if (pathname === '/printer/objects/query') {
      return send(200, {
        result: {
          status: { print_stats: fake.stats, display_status: fake.display, virtual_sdcard: fake.sdcard, extruder: fake.extruder, heater_bed: fake.bed },
        },
      })
    }
    if (pathname === '/server/history/list') return send(200, { result: { count: fake.history.length, jobs: fake.history } })
    return send(404, { error: 'not found' })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  fake.port = server.address().port
  fake.close = () => {
    server.closeAllConnections()
    return new Promise(resolve => server.close(resolve))
  }
  return fake
}
