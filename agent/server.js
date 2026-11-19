/* ==================================================================
   LOCAL AGENT — entry point.

     npm run agent              starts the agent
     npm run agent -- add       adds a printer (and list, remove: setup.js)
     npm run agent -- demo      starts it with two simulated printers (demo.js)

   Starting means: read the printers from ~/.layercents/printers.json,
   connect to each one, and open the HTTP port the web app asks.
================================================================== */
import { createServer } from 'node:http'
import { createHandler, VERSION } from './handler.js'
import { configPath, readConfig } from './config.js'
import { createPrinters } from './printers.js'
import { openJobLog } from './jobs.js'

// 127.0.0.1 and never 0.0.0.0: the agent only answers this same
// computer. On every network interface, anyone on the same Wi-Fi could
// read it, and it holds printer access codes.
const HOST = '127.0.0.1'

// Fixed, because the web app has to know where to look. 31415 is below
// 32768, outside the ranges operating systems hand out for outgoing
// connections (ephemeral ports), so it won't randomly be taken.
const PORT = 31415

// Anything after "--" in `npm run agent -- add` arrives here.
const [command, ...args] = process.argv.slice(2)

if (command === 'demo') {
  await startDemo()
} else if (command) {
  // A setup command: loaded only when asked for, and the agent doesn't start.
  const { runCommand } = await import('./setup.js')
  await runCommand([command, ...args])
} else {
  await startAgent()
}

/* Demo: the same agent, with simulated printers and a throwaway folder
   (LAYERCENTS_HOME) that is deleted on Ctrl+C. Nothing of the person's
   real setup is read or written. */
async function startDemo() {
  const { DEMO_PRINTERS, createDemoDriver, demoClock, prepareDemoHome } = await import('./demo.js')
  const { home, cleanup } = await prepareDemoHome()
  process.env.LAYERCENTS_HOME = home
  const drivers = { bambu: createDemoDriver, moonraker: createDemoDriver }
  console.log('DEMO: two simulated printers and three weeks of sample jobs. Nothing real is touched.')
  await startAgent({ configured: DEMO_PRINTERS, drivers, onExit: cleanup, now: demoClock() })
}

async function startAgent({ configured: given, drivers, onExit = async () => {}, now } = {}) {
  let configured = given
  if (!configured) {
    const config = await readConfig()
    configured = config.printers
    for (const s of config.skipped) console.warn(`Skipping printer "${s.id}" in ${configPath()}: ${s.reason}`)
  }

  // Each line is prefixed with the time: when something fails at 3 a.m.,
  // the console says when.
  const log = message => console.log(`${new Date().toLocaleTimeString()}  ${message}`)
  const jobs = await openJobLog({ log, ...(now ? { now } : {}) })
  const printers = createPrinters(configured, { log, jobLog: jobs, ...(drivers ? { drivers } : {}) })
  const server = createServer(createHandler({ printers, jobs }))

  // The usual way to fail: a second copy of the agent is already running.
  // A clear message beats Node's stack trace.
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Is the layercents agent already running?`)
      process.exit(1)
    }
    // Any other error is unexpected: let Node print it and stop.
    throw err
  })

  server.listen(PORT, HOST, () => {
    console.log(`layercents agent ${VERSION} listening on http://${HOST}:${PORT}`)
    if (configured.length === 0) console.log('No printers yet. Stop the agent (Ctrl+C) and run "npm run agent -- add".')
    else console.log(`Connecting to ${configured.length} printer${configured.length === 1 ? '' : 's'}: ${configured.map(p => p.name).join(', ')}`)
    console.log('Open layercents.com/?agent and the Printers tab. Ctrl+C to stop.')
    printers.start()
  })

  // Ctrl+C sends SIGINT: say goodbye to each printer (MQTT DISCONNECT),
  // let open requests finish, then exit.
  process.on('SIGINT', () => {
    console.log('\nStopping the layercents agent…')
    printers.stop()
    // The job log writes in the background: wait until the last write is on disk.
    jobs.flush().then(onExit).finally(() => server.close(() => process.exit(0)))
  })
}
