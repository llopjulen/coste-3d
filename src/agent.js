/* ==================================================================
   AGENT CLIENT — how the web app finds the local agent (agent/ in
   this repo) and asks it things. No React in here, so the functions
   can be tested in Node against the real agent code (agent.test.js).
================================================================== */
import { KEYS } from './backup.js'

// Where the agent listens. It must match HOST and PORT in agent/server.js:
// the address is fixed on both sides, so nothing has to be configured.
export const AGENT_URL = 'http://127.0.0.1:31415'

// The agent API version this web app speaks (PROTOCOL in agent/handler.js).
// The web updates on every deploy but each person's agent doesn't, so an
// old agent is detected here instead of failing later in odd ways.
// 2: the agent has GET /printers (live printer status).
export const AGENT_PROTOCOL = 2

// A local server answers in milliseconds and a closed port is refused at
// once, but some firewalls silently drop the packet, and then the browser
// would wait about a minute. Two seconds is plenty for 127.0.0.1.
const TIMEOUT_MS = 2000

/* Asks the agent how it is. Never throws; returns one of:
   { status: 'connected', info }   our agent, speaking our protocol
   { status: 'outdated', info }    our agent, but another protocol version
   { status: 'wrong', httpStatus } something answered, but not our agent
   { status: 'offline' }           nothing usable answered
   `url` is a parameter only so tests can point it at a throwaway port. */
export async function checkAgent({ url = AGENT_URL } = {}) {
  let res
  try {
    // no-store: a cached "connected" from earlier must never hide a stopped agent.
    res = await fetch(`${url}/health`, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    // Connection refused, timeout, CORS refused, or the person said no to the
    // browser's permission prompt: from page code they all look the same.
    return { status: 'offline' }
  }
  let info = null
  try {
    info = await res.json()
  } catch {
    // Not JSON at all: certainly not our agent. info stays null.
  }
  // The name check tells our agent apart from any other program that
  // happens to use port 31415.
  if (!res.ok || info?.app !== 'layercents-agent') return { status: 'wrong', httpStatus: res.status }
  if (info.protocol !== AGENT_PROTOCOL) return { status: 'outdated', info }
  return { status: 'connected', info }
}

/* ------------------------------------------------------------------
   Opt-in. The Printers tab, and with it every call to 127.0.0.1, only
   exists in browsers where the person turned it on. Calling a local
   address from a public site makes Chrome ask for permission ("access
   other apps and services on this device"), and almost nobody runs
   the agent yet: probing on every visit would show that prompt to everyone.
   `storage`, `location` and `history` are parameters so tests can pass fakes.
------------------------------------------------------------------ */

export function isAgentEnabled(storage = globalThis.localStorage) {
  try {
    return storage.getItem(KEYS.agentEnabled) === '1'
  } catch {
    // Blocked storage (private mode): the tab simply stays off.
    return false
  }
}

export function setAgentEnabled(on, storage = globalThis.localStorage) {
  try {
    // Removed rather than set to '0', so a browser that never used it stores nothing.
    if (on) storage.setItem(KEYS.agentEnabled, '1')
    else storage.removeItem(KEYS.agentEnabled)
  } catch {
    // Not saved: the tab works for this visit and is gone after a reload.
  }
}

/* layercents.com/?agent turns the tab on: a link that can be handed out
   (the agent will print it when it starts). The parameter is then removed
   from the address bar, so a link copied from the page doesn't carry it.
   Returns true only on the visit that carried it. Called once, from
   main.jsx before React starts, because it changes the URL and storage. */
export function consumeAgentOptIn(location = window.location, history = window.history, storage = globalThis.localStorage) {
  const params = new URLSearchParams(location.search)
  if (!params.has('agent')) return false
  setAgentEnabled(true, storage)
  params.delete('agent')
  const query = params.toString()
  // replaceState swaps the URL without reloading and without adding a step
  // to the Back button; any other parameters and the #hash are kept.
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`)
  return true
}
