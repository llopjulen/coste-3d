import { useEffect, useState } from 'react'
import { fetchJobs } from './agent.js'
import { useI18n } from './i18n/context.js'
import { fmtNumber } from './i18n/format.js'
import { realDataSuggestions, summarize } from './jobStats.js'

const WINDOW_DAYS = 30

/* ==================================================================
   REAL DATA — what the person's own printers say, offered to the
   calculator: the failure rate they really have and how far the slicer's
   time is from the real one.

   It only runs for people who turned the agent on (`enabled`): everyone
   else never makes a request to 127.0.0.1 (see agent.js). It reads the
   job log ONCE when the calculator opens, with no polling: the numbers
   are a 30-day summary, they don't change by the minute. If the agent is
   off, has no jobs or has too few (jobStats.MIN_PRINTS), it renders
   nothing: an empty box that says "no data" on every visit is noise.

   Nothing is applied by itself. The buttons call back into App, which
   saves the failure rate in "Your setup" (it is a setup field) and
   scales the print time of THIS part.
================================================================== */
export default function RealData({ enabled, failRate, hours, onUseFailRate, onUseTime }) {
  const { t, tp, locale } = useI18n()
  const [sum, setSum] = useState(null)
  // The print time the button last wrote: while the form still holds it, the
  // button is spent. Pressing twice would apply the correction twice.
  const [appliedHours, setAppliedHours] = useState(null)

  useEffect(() => {
    if (!enabled) return undefined
    let alive = true
    fetchJobs().then(result => {
      if (alive && result.ok) setSum(summarize(result.jobs, { days: WINDOW_DAYS }))
    })
    return () => { alive = false }
  }, [enabled])

  if (!enabled || !sum) return null
  const { failPct, hoursFactor } = realDataSuggestions(sum)
  if (failPct === null && hoursFactor === null) return null

  const fmt = n => fmtNumber(locale, n, 1)
  const newHours = hoursFactor === null ? null : Math.round(hours * hoursFactor * 100) / 100
  const faster = hoursFactor !== null && hoursFactor < 1

  return (
    <section className="panel" aria-labelledby="real-title">
      <h2 id="real-title">{t('real.title')}</h2>
      <div className="body real-data">
        {failPct !== null && (
          <div className="real-row">
            <span>
              {t('real.fail', { pct: fmt(failPct), prints: tp('real.prints', sum.finished + sum.failed), days: WINDOW_DAYS })}
              {' '}<span className="muted">{t('real.current', { pct: fmt(failRate) })}</span>
            </span>
            <button type="button" className="controls" disabled={failPct === failRate} onClick={() => onUseFailRate(failPct)}>
              {failPct === failRate ? t('real.applied') : t('real.useFail', { pct: fmt(failPct) })}
            </button>
          </div>
        )}
        {hoursFactor !== null && (
          <div className="real-row">
            <span>
              {t(faster ? 'real.timeShorter' : 'real.timeLonger', { pct: fmt(Math.abs(hoursFactor - 1) * 100) })}
            </span>
            <button
              type="button"
              className="controls"
              disabled={!(hours > 0) || hours === appliedHours}
              onClick={() => { onUseTime(newHours); setAppliedHours(newHours) }}
            >
              {hours === appliedHours ? t('real.applied') : t('real.useTime', { hours: fmtNumber(locale, newHours ?? 0, 2) })}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
