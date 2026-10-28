/* Tests for jobStats.js. Run them with:  npm test */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MIN_PRINTS, describeEstimateError, median, summarize, summarizeByPrinter } from './jobStats.js'

const NOW = new Date('2026-10-28T12:00:00Z')
const daysAgo = n => new Date(NOW.getTime() - n * 86_400_000).toISOString()
let counter = 0
/* A job record as the agent sends it, with sensible defaults. */
const job = (fields = {}) => ({
  id: `j${++counter}`, printerId: 'p1s', printerName: 'P1S', name: 'Stand', startedAt: daysAgo(1), startedApprox: false,
  endedAt: daysAgo(1), outcome: 'finished', estimatedMinutes: 100, realMinutes: 100, ...fields,
})
const many = (n, fields) => Array.from({ length: n }, () => job(fields))

test('median: the middle value, robust to one outlier', () => {
  assert.equal(median([]), null)
  assert.equal(median([5]), 5)
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1, 3, 2]), 2.5)
  assert.equal(median([100, 101, 99, 5000]), 100.5)
})

test('failure rate: failed / (finished + failed); cancelled, unknown and running do not count', () => {
  const jobs = [...many(8, {}), ...many(2, { outcome: 'failed' }), ...many(5, { outcome: 'cancelled' }), ...many(3, { outcome: 'unknown', realMinutes: null }), job({ outcome: null, endedAt: null, realMinutes: null })]
  const s = summarize(jobs, { now: NOW })
  assert.equal(s.failureRate, 0.2) // 2 of 10 decided prints
  assert.deepEqual([s.finished, s.failed, s.cancelled, s.unknown, s.running, s.total], [8, 2, 5, 3, 1, 19])
})

test('with too few prints there is no rate or average, only counts', () => {
  const s = summarize(many(MIN_PRINTS - 1, {}), { now: NOW })
  assert.equal(s.finished, MIN_PRINTS - 1)
  assert.equal(s.failureRate, null)
  assert.equal(s.averageMinutes, null)
  assert.equal(s.estimateError, null)
  // A fifth print is enough.
  assert.equal(summarize(many(MIN_PRINTS, {}), { now: NOW }).failureRate, 0)
})

test('one failure in two prints is not shown as 50 %', () => {
  assert.equal(summarize([job(), job({ outcome: 'failed' })], { now: NOW }).failureRate, null)
})

test('only jobs inside the window count', () => {
  const jobs = [...many(5, { startedAt: daysAgo(2) }), ...many(9, { startedAt: daysAgo(40), outcome: 'failed' })]
  const s = summarize(jobs, { now: NOW, days: 30 })
  assert.equal(s.total, 5)
  assert.equal(s.failureRate, 0)
  assert.equal(summarize(jobs, { now: NOW, days: 60 }).total, 14)
})

test('average time: only finished prints with a measured time', () => {
  const jobs = [
    ...many(5, { realMinutes: 60 }),
    job({ realMinutes: null, startedApprox: true }), // estimated start: never averaged in
    job({ outcome: 'failed', realMinutes: 999 }), // failed after 999 min: not a typical print
  ]
  assert.equal(summarize(jobs, { now: NOW }).averageMinutes, 60)
})

test('estimate error: the typical real/estimated ratio, from prints that have both', () => {
  // Real prints take 10 % longer than the slicer says, plus one stalled print.
  const jobs = [...many(5, { realMinutes: 110, estimatedMinutes: 100 }), job({ realMinutes: 5000, estimatedMinutes: 100 })]
  const s = summarize(jobs, { now: NOW })
  assert.ok(Math.abs(s.estimateError - 0.1) < 1e-9, String(s.estimateError)) // the median ignores the outlier
  // Prints without an estimate (a printer that doesn't give one) do not enter.
  const none = summarize(many(6, { estimatedMinutes: null }), { now: NOW })
  assert.equal(none.estimateError, null)
  assert.equal(none.averageMinutes, 100) // but their times still count for the average
})

test('hours printed and prints per week', () => {
  const jobs = [...many(7, { realMinutes: 60 }), job({ outcome: 'failed', realMinutes: 120 }), job({ realMinutes: null, startedApprox: true })]
  const s = summarize(jobs, { now: NOW, days: 28 })
  assert.equal(s.hoursPrinted, 9) // 7 x 1 h + 2 h; the estimated one adds nothing
  assert.equal(s.printsPerWeek, 2) // 8 finished in 4 weeks
})

test('an empty log gives zeros and nulls, not NaN', () => {
  const s = summarize([], { now: NOW })
  assert.equal(s.total, 0)
  assert.equal(s.failureRate, null)
  assert.equal(s.hoursPrinted, 0)
  assert.equal(s.printsPerWeek, 0)
})

test('summarizeByPrinter: each printer has its own rate, busiest first', () => {
  const jobs = [
    ...many(6, { printerId: 'old', printerName: 'Old Ender' }), ...many(4, { printerId: 'old', printerName: 'Old Ender', outcome: 'failed' }),
    ...many(7, { printerId: 'new', printerName: 'New K2' }),
  ]
  const [first, second] = summarizeByPrinter(jobs, { now: NOW })
  assert.deepEqual([first.printerName, first.failureRate], ['Old Ender', 0.4])
  assert.deepEqual([second.printerName, second.failureRate], ['New K2', 0])
})

test('describeEstimateError: in words, and nothing when unknown', () => {
  assert.equal(describeEstimateError(0.084), '8 % longer')
  assert.equal(describeEstimateError(-0.05), '5 % shorter')
  assert.equal(describeEstimateError(0.01), 'About the same')
  assert.equal(describeEstimateError(null), null)
  assert.equal(describeEstimateError(Number.NaN), null)
})
