/* ==================================================================
   AGENT CONFIG — the list of printers, saved on this computer.

   Where: ~/.layercents/printers.json (the person's home folder), NOT in
   the project folder. It holds access codes, and a file inside the
   project could end up in a git commit by accident. Outside the project
   that can't happen.

   Who can read it: only this computer's user. The folder is created with
   permissions 700 and the file with 600 (owner read/write, nobody else).
   Windows ignores these numbers; there, the home folder is already
   private to its user.

   LAYERCENTS_HOME overrides the folder, so tests use a temporary one.
================================================================== */
import { mkdir, readFile, rename, writeFile, chmod } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import net from 'node:net'

export const CONFIG_VERSION = 1

export function configDir(env = process.env) {
  return env.LAYERCENTS_HOME || join(homedir(), '.layercents')
}

export function configPath(env = process.env) {
  return join(configDir(env), 'printers.json')
}

// What each field may look like. The file is edited by our own setup.js,
// but a person can open it in a text editor too, so it's checked on load.
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/
// Bambu serial numbers are 15 letters and digits (e.g. 01P00A123456789).
// A wider range is accepted so a future model with another length still works.
const SERIAL_RE = /^[A-Z0-9]{8,32}$/
// The LAN access code shown on the printer: 8 characters, letters or digits.
const ACCESS_CODE_RE = /^[A-Za-z0-9]{8}$/
// SHA-256 fingerprint as Node prints it: 32 hex bytes separated by colons.
const FINGERPRINT_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/
// A host name (printer.local) or an IP. Letters, digits, dots and dashes only:
// enough for any real address, and nothing that could smuggle in a path or port.
const HOSTNAME_RE = /^[A-Za-z0-9.-]{1,253}$/

export const isValidHost = host => typeof host === 'string' && (net.isIP(host) !== 0 || HOSTNAME_RE.test(host))

/* One printer entry -> a clean copy, or null with the reason. Only Bambu exists for now. */
export function checkPrinter(p) {
  if (!p || typeof p !== 'object') return { printer: null, reason: 'not an object' }
  if (p.brand !== 'bambu') return { printer: null, reason: `brand "${p.brand}" is not supported yet` }
  if (typeof p.id !== 'string' || !ID_RE.test(p.id)) return { printer: null, reason: 'id must be lowercase letters, digits and dashes' }
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 60) return { printer: null, reason: 'name must be 1 to 60 characters' }
  if (!isValidHost(p.host)) return { printer: null, reason: 'host must be an IP address or a host name' }
  if (typeof p.serial !== 'string' || !SERIAL_RE.test(p.serial)) return { printer: null, reason: 'serial must be 8 to 32 capital letters and digits' }
  if (typeof p.accessCode !== 'string' || !ACCESS_CODE_RE.test(p.accessCode)) return { printer: null, reason: 'access code must be 8 letters or digits' }
  if (typeof p.fingerprint !== 'string' || !FINGERPRINT_RE.test(p.fingerprint)) return { printer: null, reason: 'certificate fingerprint missing or malformed' }
  const model = typeof p.model === 'string' && p.model.length <= 30 ? p.model : null
  return {
    printer: { id: p.id, name: p.name.trim(), brand: 'bambu', model, host: p.host, serial: p.serial, accessCode: p.accessCode, fingerprint: p.fingerprint },
    reason: null,
  }
}

/* Reads the config. A missing file is a normal first run: no printers.
   Broken entries are skipped and reported, so one typo doesn't hide the rest. */
export async function readConfig(env = process.env) {
  let text
  try {
    text = await readFile(configPath(env), 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') return { printers: [], skipped: [] }
    throw err
  }
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(`${configPath(env)} is not valid JSON. Fix it or delete it and add the printers again.`)
  }
  const printers = []
  const skipped = []
  for (const entry of Array.isArray(data?.printers) ? data.printers : []) {
    const { printer, reason } = checkPrinter(entry)
    if (printer) printers.push(printer)
    else skipped.push({ id: entry?.id ?? '?', reason })
  }
  return { printers, skipped }
}

/* Saves the whole list. Written to a temporary file and then renamed:
   rename is atomic, so a crash halfway never leaves a half-written file
   (and with it, every printer lost). */
export async function writeConfig(printers, env = process.env) {
  const dir = configDir(env)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const target = configPath(env)
  const temp = `${target}.tmp`
  await writeFile(temp, `${JSON.stringify({ version: CONFIG_VERSION, printers }, null, 2)}\n`, { mode: 0o600 })
  await rename(temp, target)
  // mode on writeFile only applies when the file is created; this also
  // fixes a file that already existed with looser permissions.
  await chmod(target, 0o600)
}
