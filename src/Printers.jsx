import { useCallback, useEffect, useRef, useState } from 'react'
import { AGENT_PROTOCOL, checkAgent, fetchJobs, fetchPrinters } from './agent.js'
import { MIN_PRINTS, describeEstimateError, summarize, summarizeByPrinter } from './jobStats.js'
import { badgeText, detailLine, fmtMinutes, percent, tone } from './printerView.js'
import { useI18n } from './i18n/context.js'
import { fmtDateTime, fmtNumber, fmtShort } from './i18n/format.js'

/* ==================================================================
   PRINTERS — the tab for the local agent (beta, opt-in).
   First it checks that the agent is running; then it shows every
   printer the agent is connected to, live, and below them what the
   agent's job log says about how printing really goes. Real grams
   come in the next step (docs/IMPRESORAS.md).
================================================================== */

// How often the list is refreshed while the tab is open and visible. The
// agent answers from memory (it doesn't ask the printers each time), so
// every 3 s is cheap; a printer's progress changes about once a minute.
const REFRESH_MS = 3000
// The job log changes only when a print starts or ends, and it can hold
// hundreds of entries, so it's asked for much less often than the status.
const REFRESH_JOBS_MS = 20_000
// How far back the figures look.
const WINDOW_DAYS = 30

// Result of a print -> translation key. A result from a future agent shows as it comes.
const RESULT_KEYS = {
  finished: 'printers.result.finished',
  failed: 'printers.result.failed',
  cancelled: 'printers.result.cancelled',
  unknown: 'printers.result.unknown',
}

/* One printer: name, connection, what it's doing and how far along. */
function PrinterCard({ printer }) {
  const { t } = useI18n()
  const { job } = printer
  const online = printer.connection === 'online'
  const pct = online && job ? percent(job.progress) : null
  const left = online && printer.state === 'printing' ? fmtMinutes(job?.remainingMinutes, t) : null
  const details = online ? detailLine(printer, t) : ''
  return (
    <article className="printer-card">
      <header className="printer-head">
        <h3>
          {printer.name}
          {printer.model && <span className="muted"> · {printer.model}</span>}
        </h3>
        {/* The badge carries text, not just a colour, so it reads for everyone. */}
        <span className={`printer-badge ${tone(printer)}`}>
          {badgeText(printer, t)}
        </span>
      </header>

      {online && job?.name && <p className="printer-job">{job.name}</p>}

      {pct !== null && (
        <div className="printer-progress">
          {/* role="progressbar" with its numbers: a screen reader says "42 percent". */}
          <div className="printer-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t('printers.progress.label', { name: printer.name })}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <span className="printer-pct">{pct}%</span>
          {left && <span className="muted">{t('printers.left', { time: left })}</span>}
        </div>
      )}

      {details && <p className="printer-details muted">{details}</p>}
      {/* The agent's own explanation when something's wrong (wrong code, unreachable…). */}
      {printer.error && <p className="printer-error">{printer.error}</p>}
      {/* Why a Klipper print failed, in Klipper's own words. */}
      {online && printer.printMessage && <p className="printer-error">{printer.printMessage}</p>}
    </article>
  )
}

/* "78 %", or a dash while there isn't enough data to say it. */
const fmtRate = rate => (rate === null ? '—' : `${Math.round(rate * 100)} %`)

/* What the job log says: four figures and the latest prints. */
function PrintHistory({ jobs }) {
  const { t, tp, locale } = useI18n()
  const sum = summarize(jobs, { days: WINDOW_DAYS })
  const perPrinter = summarizeByPrinter(jobs, { days: WINDOW_DAYS })
  const enough = t('printers.history.needs', { n: MIN_PRINTS })
  return (
    <section className="panel" aria-labelledby="history-title">
      <h2 id="history-title">{t('printers.history.title')}</h2>
      <div className="printers-body">
      {jobs.length === 0 ? (
        <p className="muted">{t('printers.history.empty')}</p>
      ) : (
        <>
          <div className="stats printers-stats">
            <div className="stat">
              <span className="label">{t('printers.history.prints', { days: WINDOW_DAYS })}</span>
              <span className="value">{sum.finished + sum.failed}</span>
              <span className="muted">{[tp('printers.history.finished', sum.finished), tp('printers.history.failed', sum.failed), sum.cancelled > 0 && tp('printers.history.cancelled', sum.cancelled)].filter(Boolean).join(' · ')}</span>
            </div>
            <div className="stat">
              <span className="label">{t('printers.history.failureRate')}</span>
              <span className="value">{fmtRate(sum.failureRate)}</span>
              {sum.failureRate === null && <span className="muted">{enough}</span>}
            </div>
            <div className="stat">
              <span className="label">{t('printers.history.avgTime')}</span>
              <span className="value">{fmtMinutes(sum.averageMinutes, t) ?? '—'}</span>
              {sum.averageMinutes === null && <span className="muted">{enough}</span>}
            </div>
            <div className="stat">
              <span className="label">{t('printers.history.realVsSlicer')}</span>
              <span className="value">{describeEstimateError(sum.estimateError, t) ?? '—'}</span>
              {sum.estimateError === null && <span className="muted">{enough}</span>}
            </div>
          </div>

          {perPrinter.length > 1 && (
            <div className="table-scroll">
              <table className="history-table">
                <caption className="sr-only">{t('printers.history.caption', { days: WINDOW_DAYS })}</caption>
                <thead><tr><th>{t('printers.col.printer')}</th><th className="num">{t('printers.col.finished')}</th><th className="num">{t('printers.col.failed')}</th><th className="num">{t('printers.col.failureRate')}</th><th className="num wide">{t('printers.col.hours')}</th></tr></thead>
                <tbody>
                  {perPrinter.map(p => (
                    <tr key={p.printerId}>
                      <td className="strong">{p.printerName}</td>
                      <td className="num">{p.finished}</td>
                      <td className="num">{p.failed}</td>
                      <td className="num">{fmtRate(p.failureRate)}</td>
                      <td className="num wide">{fmtNumber(locale, p.hoursPrinted, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="printers-subtitle">{t('printers.history.latest')}</h3>
          <div className="table-scroll">
            <table className="history-table">
              <thead><tr><th className="wide">{t('printers.col.started')}</th><th className="wide">{t('printers.col.printer')}</th><th>{t('printers.col.print')}</th><th>{t('printers.col.result')}</th><th className="num">{t('printers.col.time')}</th><th className="num wide">{t('printers.col.slicerSaid')}</th></tr></thead>
              <tbody>
                {jobs.slice(0, 10).map(job => (
                  <tr key={`${job.printerId}-${job.id}`}>
                    <td className="wide">{fmtDateTime(locale, new Date(job.startedAt))}</td>
                    <td className="wide">{job.printerName}</td>
                    {/* On a phone the date and printer drop under the name (see .row-sub in index.css). */}
                    <td className="strong part">
                      {job.name ?? '—'}
                      <span className="row-sub">{job.printerName} · {fmtShort(locale, new Date(job.startedAt))}</span>
                    </td>
                    <td>{job.outcome === null ? t('printers.result.running') : Object.hasOwn(RESULT_KEYS, job.outcome) ? t(RESULT_KEYS[job.outcome]) : job.outcome}</td>
                    {/* A time worked out from progress is marked "~": it's an estimate, not a measurement. */}
                    <td className="num">{job.realMinutes !== null ? fmtMinutes(job.realMinutes, t) : job.startedApprox && job.outcome ? '~' : '—'}</td>
                    <td className="num wide">{fmtMinutes(job.estimatedMinutes, t) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      </div>
    </section>
  )
}

export default function Printers({ onTurnOff }) {
  const { t, tr, locale } = useI18n()
  // 'checking' first, so a blank state never flashes before the first answer.
  const [agent, setAgent] = useState({ status: 'checking' })
  // null = not loaded yet; [] = the agent has no printers.
  const [printers, setPrinters] = useState(null)
  // null = not loaded yet; [] = nothing recorded yet.
  const [jobs, setJobs] = useState(null)
  // Number of the latest check. If two checks overlap (a double click, or
  // StrictMode running the effect twice in development), an older answer
  // arriving late must not overwrite a newer one.
  const latest = useRef(0)

  // Asks the agent and stores the answer. useCallback keeps the same
  // function between renders, so the effect below runs once on opening
  // the tab instead of after every render.
  const ask = useCallback(async () => {
    const id = ++latest.current
    const result = await checkAgent()
    if (id === latest.current) setAgent(result)
  }, [])

  // Ask once when the tab opens; the state already starts at 'checking'.
  useEffect(() => { ask() }, [ask])

  // While the agent is connected: refresh the printers every few seconds,
  // but only while this tab is on screen and the browser tab is visible.
  // Leaving the Printers tab unmounts this component and the cleanup below
  // stops the timer, so nothing knocks on 127.0.0.1 when nobody's looking.
  const connected = agent.status === 'connected'
  useEffect(() => {
    if (!connected) return undefined
    let cancelled = false
    const refresh = async () => {
      // A hidden browser tab (another tab in front, phone locked) skips the request.
      if (document.visibilityState !== 'visible') return
      const result = await fetchPrinters()
      if (cancelled) return
      if (result.ok) setPrinters(result.printers)
      // The agent stopped answering: check it again, so the screen says why.
      else ask()
    }
    refresh()
    const timer = setInterval(refresh, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [connected, ask])

  // The job log, much less often (see REFRESH_JOBS_MS). A failed answer just
  // keeps what is on screen: the printers' own refresh is the one that
  // notices the agent has gone and checks it again.
  useEffect(() => {
    if (!connected) return undefined
    let cancelled = false
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return
      const result = await fetchJobs()
      if (!cancelled && result.ok) setJobs(result.jobs)
    }
    refresh()
    const timer = setInterval(refresh, REFRESH_JOBS_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [connected])

  // The button shows "checking" straight away, then asks. Setting state
  // here, in an event, and not inside the effect avoids an extra render.
  const check = () => {
    setAgent({ status: 'checking' })
    ask()
  }

  const { status, info } = agent

  return (
    <div className="wrap printers">
      <h1>{t('printers.title')} <span className="beta">{t('printers.beta')}</span></h1>
      <p className="subtitle">{t('printers.subtitle')}</p>

      {connected && (
        <section className="panel" aria-labelledby="printers-title">
          <h2 id="printers-title">{t('printers.mine.title')}</h2>
          <div className="printers-body">
            {printers === null && <p className="muted">{t('printers.loading')}</p>}
            {printers?.length === 0 && (
              <>
                <p>{t('printers.empty.running')}</p>
                <ol className="agent-steps">
                  <li>{t('printers.empty.step1')}</li>
                  {/* The command is a slot: each language puts it where its sentence needs it. */}
                  <li>{tr('printers.empty.step2', {}, { cmd: <code>npm run agent -- add</code> })}</li>
                  <li>{tr('printers.empty.step3', {}, { cmd: <code>npm run agent</code> })}</li>
                </ol>
                <p className="muted">{t('printers.empty.brands')}</p>
              </>
            )}
            {printers?.map(printer => <PrinterCard key={printer.id} printer={printer} />)}
          </div>
        </section>
      )}

      {connected && jobs !== null && <PrintHistory jobs={jobs} />}

      <section className="panel" aria-labelledby="agent-title">
        <h2 id="agent-title">{t('printers.agent.title')}</h2>
        {/* role="status": screen readers announce each change of the agent's
            state. The printer cards above are deliberately not a live region:
            their numbers change every few seconds and would never stop talking. */}
        <div className="agent-body" role="status">
          {status === 'checking' && <p className="muted">{t('printers.agent.checking')}</p>}

          {status === 'connected' && (
            <>
              <p className="agent-ok"><span className="agent-dot" aria-hidden="true" />{t('printers.agent.connected')}</p>
              <p className="muted">{t('printers.agent.version', { version: info.version, date: fmtDateTime(locale, new Date(info.startedAt)) })}</p>
            </>
          )}

          {status === 'outdated' && (
            <p>{tr('printers.agent.outdated', { found: String(info.protocol), needed: AGENT_PROTOCOL }, { cmd: <code>git pull</code> })}</p>
          )}

          {status === 'wrong' && (
            <p>{t('printers.agent.wrong', { status: String(agent.httpStatus) })}</p>
          )}

          {status === 'offline' && (
            <>
              <p>{t('printers.agent.offline')}</p>
              <ol className="agent-steps">
                <li>{tr('printers.agent.offline.step1', {}, { cmd: <code>npm run agent</code> })}</li>
                <li>{t('printers.agent.offline.step2')}</li>
              </ol>
              <p className="muted">{t('printers.agent.offline.hint')}</p>
            </>
          )}

          <div className="agent-actions">
            <button type="button" className="controls" onClick={check} disabled={status === 'checking'}>{t('printers.agent.check')}</button>
            <button type="button" className="link" onClick={onTurnOff}>{t('printers.agent.hide')}</button>
          </div>
        </div>
      </section>
    </div>
  )
}
