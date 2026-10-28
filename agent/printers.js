/* ==================================================================
   PRINTERS — every configured printer and its driver.

   One driver per printer, chosen by brand. The rest of the agent only
   talks to this list: start them, ask for their status, stop them.
   Adding a brand means adding a driver file and one line in DRIVERS.
================================================================== */
import { createBambuDriver } from './drivers/bambu.js'
import { NO_JOBS } from './jobs.js'

const DRIVERS = {
  bambu: createBambuDriver,
}

/* configured: the printers from config.js.
   `drivers` is a parameter so tests can plug in fakes.
   `jobLog` hears every status change (see jobs.js). */
export function createPrinters(configured, { drivers = DRIVERS, log = () => {}, jobLog = NO_JOBS } = {}) {
  const running = configured.map(printer => drivers[printer.brand](printer, { log, onStatus: status => jobLog.observe(status) }))
  return {
    start() {
      for (const driver of running) driver.start()
    },
    stop() {
      for (const driver of running) driver.stop()
    },
    /* The common status of every printer, in the order they were added.
       Never includes access codes, serial numbers or IP addresses: the web
       app doesn't need them, and what isn't sent can't leak. */
    list() {
      return running.map(driver => driver.status())
    },
  }
}

/* An empty list, for when the agent runs without printers (and for tests). */
export const NO_PRINTERS = { start() {}, stop() {}, list: () => [] }
