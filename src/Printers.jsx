import { useCallback, useEffect, useRef, useState } from 'react'
import { AGENT_PROTOCOL, checkAgent } from './agent.js'

/* ==================================================================
   PRINTERS — the tab for the local agent (beta, opt-in).
   For now it only says whether the agent is running. The printers,
   their jobs and the real numbers come in the next steps.
================================================================== */

// "22 Oct 2026, 07:50", the same format the backup panel uses.
const fmtDateTime = dt => dt.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function Printers({ onTurnOff }) {
  // 'checking' first, so a blank state never flashes before the first answer.
  const [agent, setAgent] = useState({ status: 'checking' })
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
  // Not on a timer: polling would keep knocking on 127.0.0.1 while the
  // person isn't even looking.
  useEffect(() => { ask() }, [ask])

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

      <section className="panel" aria-labelledby="agent-title">
        <h2 id="agent-title">layercents agent</h2>
        {/* role="status": screen readers announce each change of state. */}
        <div className="agent-body" role="status">
          {status === 'checking' && <p className="muted">Looking for the agent on this computer…</p>}

          {status === 'connected' && (
            <>
              <p className="agent-ok"><span className="agent-dot" aria-hidden="true" />Agent connected</p>
              <p className="muted">Version {info.version} · running since {fmtDateTime(new Date(info.startedAt))}</p>
              <p>No printers yet: connecting a Bambu Lab printer is the next step.</p>
            </>
          )}

          {status === 'outdated' && (
            <p>
              Your agent speaks protocol version {String(info.protocol)}, and this page needs version {AGENT_PROTOCOL}.
              Update the agent and start it again.
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
