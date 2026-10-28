/* ==================================================================
   PRINTERS — every configured printer and its driver.

   One driver per printer, chosen by brand. The rest of the agent only
   talks to this list: start them, ask for their status, stop them.
   Adding a brand means adding a driver file and one line in DRIVERS.
================================================================== */
import { createBambuDriver } from './drivers/bambu.js'
import { createMoonrakerDriver } from './drivers/moonraker.js'
import { NO_JOBS } from './jobs.js'

const DRIVERS = {
  bambu: createBambuDriver,
  moonraker: createMoonrakerDriver,
}

/* configured: the printers from config.js.
   `drivers` is a parameter so tests can plug in fakes.
   `jobLog` records the jobs. A driver feeds it in the way its printer allows:
   Bambu, with every status change (`onStatus`: it keeps no history, so the
   log is built by watching); Moonraker, with the printer's own history
   (`onHistory`). Each driver uses only the one it needs. */
export function createPrinters(configured, { drivers = DRIVERS, log = () => {}, jobLog = NO_JOBS } = {}) {
  const running = configured.map(printer => drivers[printer.brand](printer, {
    log,
    onStatus: status => jobLog.observe(status),
    onHistory: entries => jobLog.importHistory({ id: printer.id, name: printer.name }, entries),
  }))
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
