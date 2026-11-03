/* ==================================================================
   CLOUD SESSION — the one door between the screens and the account
   backend (docs/NUBE.md, PR step 3: sign in with an email link, sign out,
   delete the account).

   The screens (Account.jsx) only talk to this file. WHO answers is an
   "adapter", an object with the five functions below:

     getSession()             -> Promise<{ email } | null>
     onChange(callback)       -> unsubscribe function; callback(session | null)
     sendLink(email)          -> Promise<void>   (throws CloudError on failure)
     signOut()                -> Promise<void>
     deleteAccount()          -> Promise<void>

   Two adapters:
   - mock (this file): fake, in memory and sessionStorage, to build and test
     the screens before the backend exists. Turned on with ?cloud=mock in
     the address, only for this tab.
   - live: Julen's, with supabase-js, in its own file. It calls
     registerCloudAdapter(adapter) once at start (main.jsx). The login and
     the security are his to write (CLAUDE.md); this file is the contract
     they plug into, so the screens don't change when it lands.

   With neither, cloudMode() is 'off' and the account entry is not shown:
   nothing changes for anyone using layercents.com today.
================================================================== */

export class CloudError extends Error {
  // `code` picks the translated text (account.err.<code>); `message` is for the console.
  constructor(code, message = code) {
    super(message)
    this.code = code
  }
}

let live = null
export function registerCloudAdapter(adapter) { live = adapter }

const MOCK_FLAG = 'cloudMock'
const MOCK_SESSION = 'cloudMockSession'

/* ?cloud=mock turns the mock on for this tab; ?cloud=off turns it off.
   Kept in sessionStorage, not localStorage: closing the tab ends the test. */
function mockWanted() {
  try {
    const q = new URLSearchParams(window.location.search).get('cloud')
    if (q === 'mock') sessionStorage.setItem(MOCK_FLAG, '1')
    if (q === 'off') sessionStorage.removeItem(MOCK_FLAG)
    return sessionStorage.getItem(MOCK_FLAG) === '1'
  } catch {
    return false
  }
}

export function cloudMode() {
  if (live) return 'live'
  return typeof window !== 'undefined' && mockWanted() ? 'mock' : 'off'
}

export function adapter() {
  return cloudMode() === 'live' ? live : cloudMode() === 'mock' ? mockAdapter : null
}

// A plausible email: something@something.tld, no spaces. The server checks
// again; this only saves a round trip for an obvious typo.
export const looksLikeEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())

/* ---------------- The mock ---------------- */
const listeners = new Set()
const readMock = () => {
  try { return JSON.parse(sessionStorage.getItem(MOCK_SESSION)) } catch { return null }
}
const writeMock = session => {
  try {
    if (session) sessionStorage.setItem(MOCK_SESSION, JSON.stringify(session))
    else sessionStorage.removeItem(MOCK_SESSION)
  } catch { /* the mock just forgets */ }
  for (const fn of listeners) fn(session)
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

export const mockAdapter = {
  async getSession() { return readMock() },
  onChange(callback) { listeners.add(callback); return () => listeners.delete(callback) },
  async sendLink(email) {
    await wait(500)
    if (!looksLikeEmail(email)) throw new CloudError('email')
    if (/fail/i.test(email)) throw new CloudError('network')
    // The real thing sends an email and signs in when the link is opened.
    // The mock "opens" it after a moment, so the whole flow can be seen.
    setTimeout(() => writeMock({ email: email.trim() }), 1500)
  },
  async signOut() { await wait(200); writeMock(null) },
  async deleteAccount() { await wait(500); writeMock(null) },
}
