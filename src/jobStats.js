/* ==================================================================
   JOB STATS — what the agent's job log says about how printing really goes.

   Pure functions (no React), so they're tested on their own
   (jobStats.test.js). The jobs come from the agent in the shape
   documented in agent/jobs.js.

   Three rules decide what counts, and all three are about not fooling
   the person:

   1. The failure rate is failed / (finished + failed). Cancelled prints
      are the person's decision and don't count as failures; "unknown"
      ones (we didn't see how they ended) and the one still running
      don't count either way. Counting them would inflate or deflate
      the rate with things that aren't failures or successes.
   2. Times come only from jobs whose start was seen (`realMinutes` is
      null otherwise), so an estimate is never averaged in as if measured.
   3. With few prints a percentage means nothing (1 failure in 2 prints is
      "50 %"). Below MIN_PRINTS the figure is null and the screen says so.
================================================================== */

// Below this many prints, rates and averages are not shown.
export const MIN_PRINTS = 5

const DAY_MS = 86_400_000

/* The middle value. Used instead of the mean for "real vs estimated": one
   print that stalled for a day would drag a mean up and say nothing about
   the typical print. */
export function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0

/* Summary of the jobs that started in the last `days` days.
   Returns counts always, and the derived figures as null while there's not enough to say them. */
export function summarize(jobs, { now = new Date(), days = 30 } = {}) {
  const since = now.getTime() - days * DAY_MS
  const recent = jobs.filter(j => Date.parse(j.startedAt) >= since)
  const count = outcome => recent.filter(j => j.outcome === outcome).length
  const finished = recent.filter(j => j.outcome === 'finished')
  const failed = count('failed')
  const decided = finished.length + failed

  // Wall-clock minutes of the finished prints whose start we saw.
  const times = finished.map(j => j.realMinutes).filter(positive)
  // The same prints against what the slicer promised: only jobs with both numbers.
  const ratios = finished.filter(j => positive(j.realMinutes) && positive(j.estimatedMinutes)).map(j => j.realMinutes / j.estimatedMinutes)
  const typical = ratios.length >= MIN_PRINTS ? median(ratios) : null

  return {
    days,
    total: recent.length,
    finished: finished.length,
    failed,
    cancelled: count('cancelled'),
    unknown: count('unknown'),
    running: recent.filter(j => j.outcome === null).length,
    failureRate: decided >= MIN_PRINTS ? failed / decided : null,
    averageMinutes: times.length >= MIN_PRINTS ? times.reduce((a, b) => a + b, 0) / times.length : null,
    // 0.08 = real prints take 8 % longer than the slicer says; -0.05 = 5 % shorter.
    estimateError: typical === null ? null : typical - 1,
    // Hours the printers really worked (finished, failed and cancelled prints with a measured time).
    hoursPrinted: recent.reduce((sum, j) => sum + (positive(j.realMinutes) ? j.realMinutes : 0), 0) / 60,
    printsPerWeek: finished.length / (days / 7),
  }
}

/* One summary per printer, busiest first. Each printer's rate is its own:
   an old printer that fails more must not be hidden by a good one. */
export function summarizeByPrinter(jobs, options) {
  const names = new Map()
  for (const job of jobs) names.set(job.printerId, job.printerName ?? job.printerId)
  return [...names]
    .map(([printerId, printerName]) => ({ printerId, printerName, ...summarize(jobs.filter(j => j.printerId === printerId), options) }))
    .sort((a, b) => b.total - a.total)
}

/* 0.084 -> "8 % longer"; -0.05 -> "5 % shorter"; within 2 % -> "about the same". Null if unknown. */
export function describeEstimateError(error) {
  if (typeof error !== 'number' || !Number.isFinite(error)) return null
  const pct = Math.round(Math.abs(error) * 100)
  if (pct < 2) return 'About the same'
  return `${pct} % ${error > 0 ? 'longer' : 'shorter'}`
}
