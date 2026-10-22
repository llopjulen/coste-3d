/* ==================================================================
   LOCAL AGENT — entry point.  Start it with:  npm run agent
   Opens the HTTP port and hands every request to handler.js.
================================================================== */
import { createServer } from 'node:http'
import { createHandler, VERSION } from './handler.js'

// 127.0.0.1 and never 0.0.0.0: the agent only answers this same
// computer. On every network interface, anyone on the same Wi-Fi could
// read it, and later it will hold printer access codes.
const HOST = '127.0.0.1'

// Fixed, because the web app has to know where to look. 31415 is below
// 32768, outside the ranges operating systems hand out for outgoing
// connections (ephemeral ports), so it won't randomly be taken.
const PORT = 31415

const server = createServer(createHandler())

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
  console.log(`Check it: open http://${HOST}:${PORT}/health in your browser. Ctrl+C to stop.`)
})

// Ctrl+C sends SIGINT. Closing the server first lets open requests
// finish; later it will also be where printer connections are closed.
process.on('SIGINT', () => {
  console.log('\nStopping the layercents agent…')
  server.close(() => process.exit(0))
})
