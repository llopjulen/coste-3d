/* ==================================================================
   AGENT SETUP — add, list and remove printers from the terminal.

     npm run agent -- add       asks for the details and tests them
     npm run agent -- list      shows the saved printers
     npm run agent -- remove <id>

   Why the terminal and not the web page: adding a printer means typing
   its access code. Here it goes straight from the keyboard to a file on
   this computer. Through the web page it would pass through a browser
   tab where other code runs, and the agent would need an endpoint that
   CHANGES things, which is a much bigger door to keep shut than one
   that only reads. A screen for this can come later, with that work done.

   The code is asked for in an interactive prompt and not as an argument
   (npm run agent -- add --code 12345678) because arguments are saved in
   the shell's history file.
================================================================== */
import { createInterface } from 'node:readline'
import { stdin, stdout } from 'node:process'
import { configPath, isValidHost, readConfig, writeConfig, checkPrinter } from './config.js'
import { probeBambu } from './drivers/bambu.js'

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

async function add() {
  const rl = createInterface({ input: stdin, output: stdout })
  const read = lineReader(rl)
  try {
    console.log('Adding a Bambu Lab printer. Have its screen at hand.\n')
    const name = await ask(read, 'Name for this printer (e.g. P1S workshop): ', v => (v && v.length <= 60 ? null : 'Between 1 and 60 characters.'))
    const model = await ask(read, 'Model, optional (e.g. P1S): ', v => (v.length <= 30 ? null : 'Up to 30 characters.'))
    const host = await ask(read, 'IP address (printer screen, network settings): ', v => (isValidHost(v) ? null : 'That doesn’t look like an IP address, e.g. 192.168.1.50'))
    const serial = await ask(read, 'Serial number (Settings > Device): ', v => (/^[A-Z0-9]{8,32}$/.test(v) ? null : 'Letters and digits only, as shown on the printer.'), v => v.trim().toUpperCase().replace(/\s+/g, ''))
    const accessCode = await ask(read, 'Access code (8 characters; it stays on this computer): ', v => (/^[A-Za-z0-9]{8}$/.test(v) ? null : 'The access code has 8 letters or digits.'))

    console.log('\nTesting the connection…')
    let probe
    try {
      probe = await probeBambu({ host, serial, accessCode })
    } catch (err) {
      console.log(`\n✗ ${probeErrorText(err, { host, serial })}\nNothing was saved. Run "npm run agent -- add" again when it's fixed.`)
      process.exitCode = 1
      return
    }

    const { printers } = await readConfig()
    // The same printer added twice (same serial) replaces the old entry;
    // a new printer whose name gives an id already in use gets a number.
    const others = printers.filter(p => p.serial !== serial)
    let id = slugify(name)
    for (let n = 2; others.some(p => p.id === id); n++) id = `${slugify(name).slice(0, 36)}-${n}`
    const { printer, reason } = checkPrinter({ id, name, brand: 'bambu', model: model || null, host, serial, accessCode, fingerprint: probe.fingerprint })
    // Every field was already checked while typing; this is the same check
    // config.js runs on load, so nothing gets saved that the agent would skip.
    if (!printer) throw new Error(`internal: ${reason}`)
    await writeConfig([...others, printer])

    console.log(`\n✓ Connected. The printer says: ${probe.state}.`)
    console.log(`  Certificate fingerprint saved: ${probe.fingerprint.slice(0, 23)}…`)
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

async function list() {
  const { printers, skipped } = await readConfig()
  if (printers.length === 0) console.log('No printers yet. Add one with "npm run agent -- add".')
  // Never the access code: this output ends up in screenshots and support messages.
  for (const p of printers) console.log(`${p.id}  ·  ${p.name}${p.model ? ` (${p.model})` : ''}  ·  ${p.host}  ·  serial ${p.serial}`)
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
