import { useCallback, useEffect, useRef, useState } from 'react'
import { AGENT_PROTOCOL, checkAgent, fetchPrinters } from './agent.js'
import { CONNECTION_LABELS, STATE_LABELS, detailLine, fmtMinutes, percent, tone } from './printerView.js'

/* ==================================================================
   PRINTERS — the tab for the local agent (beta, opt-in).
   First it checks that the agent is running; then it shows every
   printer the agent is connected to, live. Jobs history and real
   grams come in the next steps (docs/IMPRESORAS.md).
================================================================== */

// "22 Oct 2026, 07:50", the same format the backup panel uses.
const fmtDateTime = dt => dt.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// How often the list is refreshed while the tab is open and visible. The
// agent answers from memory (it doesn't ask the printers each time), so
// every 3 s is cheap; a printer's progress changes about once a minute.
const REFRESH_MS = 3000

/* One printer: name, connection, what it's doing and how far along. */
function PrinterCard({ printer }) {
  const { job } = printer
  const online = printer.connection === 'online'
  const pct = online && job ? percent(job.progress) : null
  const left = online && printer.state === 'printing' ? fmtMinutes(job?.remainingMinutes) : null
  const details = online ? detailLine(printer) : ''
  return (
    <article className="printer-card">
      <header className="printer-head">
        <h3>
          {printer.name}
          {printer.model && <span className="muted"> · {printer.model}</span>}
        </h3>
        {/* The badge carries text, not just a colour, so it reads for everyone. */}
        <span className={`printer-badge ${tone(printer)}`}>
          {online ? STATE_LABELS[printer.state] ?? STATE_LABELS.unknown : CONNECTION_LABELS[printer.connection] ?? printer.connection}
        </span>
      </header>

      {online && job?.name && <p className="printer-job">{job.name}</p>}

      {pct !== null && (
        <div className="printer-progress">
          {/* role="progressbar" with its numbers: a screen reader says "42 percent". */}
          <div className="printer-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Progress of ${printer.name}`}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <span className="printer-pct">{pct}%</span>
          {left && <span className="muted">{left} left</span>}
        </div>
      )}

      {details && <p className="printer-details muted">{details}</p>}
      {/* The agent's own explanation when something's wrong (wrong code, unreachable…). */}
      {printer.error && <p className="printer-error">{printer.error}</p>}
    </article>
  )
}

export default function Printers({ onTurnOff }) {
  // 'checking' first, so a blank state never flashes before the first answer.
  const [agent, setAgent] = useState({ status: 'checking' })
  // null = not loaded yet; [] = the agent has no printers.
  const [printers, setPrinters] = useState(null)
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

  // The button shows "checking" straight away, then asks. Setting state
  // here, in an event, and not inside the effect avoids an extra render.
  const check = () => {
    setAgent({ status: 'checking' })
    ask()
  }

  const { status, info } = agent

  return (
    <div className="wrap printers">
      <h1>Printers <span className="beta">Beta</span></h1>
      <p className="subtitle">Connect your printers so print time, grams and failures come from your real prints instead of estimates.</p>

      {connected && (
        <section className="panel" aria-labelledby="printers-title">
          <h2 id="printers-title">Your printers</h2>
          <div className="printers-body">
            {printers === null && <p className="muted">Loading printers…</p>}
            {printers?.length === 0 && (
              <>
                <p>The agent is running, but it has no printers yet.</p>
                <ol className="agent-steps">
                  <li>Stop the agent with Ctrl+C.</li>
                  <li>Run <code>npm run agent -- add</code> and answer with your printer’s IP, serial number and access code.</li>
                  <li>Start it again with <code>npm run agent</code>.</li>
                </ol>
                <p className="muted">For now the agent connects to Bambu Lab printers. Klipper (Creality K1/K2, Elegoo Neptune, Qidi, Sovol) and Prusa are next.</p>
              </>
            )}
            {printers?.map(printer => <PrinterCard key={printer.id} printer={printer} />)}
          </div>
        </section>
      )}

      <section className="panel" aria-labelledby="agent-title">
        <h2 id="agent-title">layercents agent</h2>
        {/* role="status": screen readers announce each change of the agent's
            state. The printer cards above are deliberately not a live region:
            their numbers change every few seconds and would never stop talking. */}
        <div className="agent-body" role="status">
          {status === 'checking' && <p className="muted">Looking for the agent on this computer…</p>}

          {status === 'connected' && (
            <>
              <p className="agent-ok"><span className="agent-dot" aria-hidden="true" />Agent connected</p>
              <p className="muted">Version {info.version} · running since {fmtDateTime(new Date(info.startedAt))}</p>
            </>
          )}

          {status === 'outdated' && (
            <p>
              Your agent speaks protocol version {String(info.protocol)}, and this page needs version {AGENT_PROTOCOL}.
              Update the agent (in the project folder: <code>git pull</code>) and start it again.
            </p>
          )}

          {status === 'wrong' && (
            <p>
              Another program is answering on port 31415 (HTTP {String(agent.httpStatus)}).
              Stop that program, then start the agent.
            </p>
          )}

          {status === 'offline' && (
            <>
              <p>The agent isn’t running on this computer.</p>
              <ol className="agent-steps">
                <li>In the layercents project folder, run <code>npm run agent</code>.</li>
                <li>Press “Check again”.</li>
              </ol>
              <p className="muted">If your browser asks to let this site access apps or devices on your computer, allow it: that’s how the page reaches the agent.</p>
            </>
          )}

          <div className="agent-actions">
            <button type="button" className="controls" onClick={check} disabled={status === 'checking'}>Check again</button>
            <button type="button" className="link" onClick={onTurnOff}>Hide this tab</button>
          </div>
        </div>
      </section>
    </div>
  )
}
