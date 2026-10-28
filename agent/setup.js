/* ==================================================================
   AGENT SETUP — add, list and remove printers from the terminal.

     npm run agent -- add       asks for the details and tests them
     npm run agent -- list      shows the saved printers
     npm run agent -- remove <id>

   Why the terminal and not the web page: adding a printer can mean typing
   its access code. Here it goes straight from the keyboard to a file on
   this computer. Through the web page it would pass through a browser
   tab where other code runs, and the agent would need an endpoint that
   CHANGES things, which is a much bigger door to keep shut than one
   that only reads. A screen for this can come later, with that work done.

   The code (or the API key of a Klipper printer) is asked for in an
   interactive prompt and not as an argument (npm run agent -- add
   --code 12345678) because arguments are saved in the shell's history file.
================================================================== */
import { createInterface } from 'node:readline'
import { stdin, stdout } from 'node:process'
import { configPath, isValidHost, readConfig, writeConfig, checkPrinter } from './config.js'
import { probeBambu } from './drivers/bambu.js'
import { MOONRAKER_PORT, probeMoonraker } from './drivers/moonraker.js'

/* "P1S del taller" -> "p1s-del-taller": the id used in the config and in the web app. */
export function slugify(name) {
  const slug = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // á -> a, ñ -> n
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug || 'printer'
}

/* What went wrong while testing the details, in words the person can act on. */
export function probeErrorText(err, { host, serial }) {
  if (err.code === 'CONNECT_REFUSED') return 'The printer refused the access code. Check it on the printer’s screen (P1P/P1S: Settings > WLAN; X1/H2: Settings > General; A1: turn on LAN Only Mode to see it).'
  if (err.code === 'NO_REPORT') return `Logged in, but no status arrived for serial ${serial}. Check the serial number (Settings > Device on the printer, or in Bambu Studio).`
  if (err.code === 'SUBSCRIBE_REFUSED') return `The printer refused serial ${serial}. Check the serial number.`
  return `Can’t reach ${host}:8883 (${err.message}). Is the printer on, on the same network as this computer, and is the IP right?`
}

/* Reads lines one by one. readline's question() loses lines that arrive
   before it's called (all of them, when the answers are piped in from a
   file or a test); its async iterator keeps them in a queue instead. */
function lineReader(rl) {
  const lines = rl[Symbol.asyncIterator]()
  return async question => {
    stdout.write(question)
    const { value, done } = await lines.next()
    if (done) throw Object.assign(new Error('input ended'), { code: 'INPUT_ENDED' })
    return value
  }
}

async function ask(read, question, check, fix = v => v.trim()) {
  for (;;) {
    const answer = fix(await read(question))
    const problem = check(answer)
    if (!problem) return answer
    console.log(`  ${problem}`)
  }
}

/* Adds a printer: asks the brand, then only what that brand needs. */
async function add() {
  const rl = createInterface({ input: stdin, output: stdout })
  const read = lineReader(rl)
  try {
    const brand = await ask(read, 'What kind of printer?\n  1) Bambu Lab (A1, P1S, X1C, H2D…)\n  2) Klipper with Moonraker (Creality K1/K2, Elegoo Neptune 4, Qidi, Sovol, Voron…)\n> ', v => (v === '1' || v === '2' ? null : 'Type 1 or 2.'))
    console.log('')
    const name = await ask(read, 'Name for this printer (e.g. Workshop 1): ', v => (v && v.length <= 60 ? null : 'Between 1 and 60 characters.'))
    const model = await ask(read, 'Model, optional (e.g. K2 Plus): ', v => (v.length <= 30 ? null : 'Up to 30 characters.'))
    const host = await ask(read, 'IP address (printer screen, network settings): ', v => (isValidHost(v) ? null : 'That doesn’t look like an IP address, e.g. 192.168.1.50'))
    const found = brand === '1' ? await addBambu(read, { name, model, host }) : await addMoonraker(read, { name, model, host })
    if (!found) {
      process.exitCode = 1
      return
    }

    const { printers } = await readConfig()
    // The same printer added twice replaces the old entry (same serial for
    // Bambu; same address and port for Klipper); a new printer whose name
    // gives an id already in use gets a number.
    const others = printers.filter(p => !found.isSame(p))
    let id = slugify(name)
    for (let n = 2; others.some(p => p.id === id); n++) id = `${slugify(name).slice(0, 36)}-${n}`
    const { printer, reason } = checkPrinter({ id, name, model: model || null, host, ...found.fields })
    // Every field was already checked while typing; this is the same check
    // config.js runs on load, so nothing gets saved that the agent would skip.
    if (!printer) throw new Error(`internal: ${reason}`)
    await writeConfig([...others, printer])

    console.log(`\n✓ ${found.message}`)
    console.log(`  Saved as "${id}" in ${configPath()}`)
    console.log('\nNow start the agent with "npm run agent" and open the Printers tab on layercents.com.')
  } catch (err) {
    // Ctrl+D, or answers piped in that run out: stop without saving anything.
    if (err.code !== 'INPUT_ENDED') throw err
    console.log('\nCancelled. Nothing was saved.')
    process.exitCode = 1
  } finally {
    rl.close()
  }
}

/* The Bambu part of "add". Returns what to save, or null after saying what failed. */
async function addBambu(read, { host }) {
  const serial = await ask(read, 'Serial number (Settings > Device): ', v => (/^[A-Z0-9]{8,32}$/.test(v) ? null : 'Letters and digits only, as shown on the printer.'), v => v.trim().toUpperCase().replace(/\s+/g, ''))
  const accessCode = await ask(read, 'Access code (8 characters; it stays on this computer): ', v => (/^[A-Za-z0-9]{8}$/.test(v) ? null : 'The access code has 8 letters or digits.'))
  console.log('\nTesting the connection…')
  let probe
  try {
    probe = await probeBambu({ host, serial, accessCode })
  } catch (err) {
    console.log(`\n✗ ${probeErrorText(err, { host, serial })}\nNothing was saved. Run "npm run agent -- add" again when it's fixed.`)
    return null
  }
  return {
    fields: { brand: 'bambu', serial, accessCode, fingerprint: probe.fingerprint },
    isSame: p => p.serial === serial,
    message: `Connected. The printer says: ${probe.state}.\n  Certificate fingerprint saved: ${probe.fingerprint.slice(0, 23)}…`,
  }
}

/* The Klipper part of "add". */
async function addMoonraker(read, { host }) {
  const portText = await ask(read, 'Moonraker port [7125]: ', v => (v === '' || (/^\d{1,5}$/.test(v) && Number(v) >= 1 && Number(v) <= 65535) ? null : 'A port number, usually 7125.'))
  const port = portText === '' ? MOONRAKER_PORT : Number(portText)
  const key = await ask(read, 'API key, only if Moonraker asks for one (Enter to skip): ', v => (v === '' || /^[A-Za-z0-9_.~-]{8,128}$/.test(v) ? null : 'That key has characters that can’t be used.'))
  const apiKey = key || null
  console.log('\nTesting the connection…')
  let probe
  try {
    probe = await probeMoonraker({ host, port, apiKey })
  } catch (err) {
    console.log(`\n✗ ${moonrakerProbeText(err, { port })}\nNothing was saved. Run "npm run agent -- add" again when it's fixed.`)
    return null
  }
  const klipper = probe.klippyState === 'ready' ? 'Klipper is ready.' : `Klipper says “${probe.klippyState}”: restart the firmware from Mainsail or Fluidd.`
  return {
    fields: { brand: 'moonraker', port, apiKey },
    isSame: p => p.host === host && (p.port ?? MOONRAKER_PORT) === port,
    message: `Connected. Moonraker ${probe.version}. ${klipper}`,
  }
}

/* What went wrong while testing a Klipper printer, in words the person can act on. */
export function moonrakerProbeText(err, { port }) {
  if (err.code === 'UNAUTHORIZED') return 'Moonraker asked for an API key and refused the one given. Look for it in the printer’s moonraker.conf (or in Mainsail/Fluidd settings).'
  if (err.code === 'KLIPPER_DOWN') return 'Moonraker answered, but Klipper is not running. Restart the firmware from Mainsail or Fluidd and try again.'
  if (err.code === 'BAD_JSON' || err.code === 'HTTP' || err.code === 'REDIRECT' || err.code === 'TOO_BIG') return `Something answers on port ${port}, but it isn’t Moonraker. Check the port (usually 7125).`
  return `Can’t reach the printer on port ${port} (${err.code ?? 'connection failed'}). Is it on, on the same network as this computer, and is the IP right?`
}

async function list() {
  const { printers, skipped } = await readConfig()
  if (printers.length === 0) console.log('No printers yet. Add one with "npm run agent -- add".')
  // Never the access code: this output ends up in screenshots and support messages.
  for (const p of printers) {
    const detail = p.brand === 'bambu' ? `serial ${p.serial}` : `Klipper, port ${p.port}`
    console.log(`${p.id}  ·  ${p.name}${p.model ? ` (${p.model})` : ''}  ·  ${p.host}  ·  ${detail}`)
  }
  for (const s of skipped) console.log(`(skipped "${s.id}": ${s.reason})`)
  console.log(`\nFile: ${configPath()}`)
}

async function remove(id) {
  if (!id) {
    console.log('Which one? Usage: npm run agent -- remove <id>   (see the ids with "npm run agent -- list")')
    process.exitCode = 1
    return
  }
  const { printers } = await readConfig()
  const rest = printers.filter(p => p.id !== id)
  if (rest.length === printers.length) {
    console.log(`There's no printer with id "${id}".`)
    process.exitCode = 1
    return
  }
  await writeConfig(rest)
  console.log(`Removed "${id}".`)
}

/* Entry point from server.js: `npm run agent -- <command>`. */
export async function runCommand([command, ...args]) {
  if (command === 'add') return add()
  if (command === 'list') return list()
  if (command === 'remove') return remove(args[0])
  console.log('Commands:\n  npm run agent              start the agent\n  npm run agent -- add       add a printer\n  npm run agent -- list      list printers\n  npm run agent -- remove <id>')
  process.exitCode = 1
  return undefined
}
