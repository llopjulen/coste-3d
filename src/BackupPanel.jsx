import { useEffect, useRef, useState } from 'react'
import { BackupError, StorageWriteError, backupStatus, hasStoredSettings, readBackupFile } from './backup.js'

/* ==================================================================
   BACKUP — the panel at the bottom of History and the reminder at
   the top. App owns the data; these components only show it and
   report what the person chose (onBackup, onRestore).
   Restore is two steps on purpose: pick a file -> see what's in it ->
   choose merge or replace. Nothing is written before that choice.
================================================================== */

// "22 Oct 2026, 07:15": month in letters, like the dates in History.
const fmtDateTime = dt => dt.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
// "22 Oct 2026": the same format History uses for each quote.
const fmtDay = dt => dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
// "1 quote" / "5 quotes".
const quotesText = n => `${n} ${n === 1 ? 'quote' : 'quotes'}`
// Same format CustomerQuote gives the default number, so the summary
// shows exactly what the next quote will be called: 2026-007.
const quoteNumber = n => `${new Date().getFullYear()}-${String(n).padStart(3, '0')}`

/* The line shown after a restore, from planRestore's stats. */
function restoredText(stats) {
  if (stats.mode === 'replace') {
    // Say what was deleted: replace is the only action that removes quotes.
    const removed = stats.removed > 0 ? ` ${quotesText(stats.removed)} that ${stats.removed === 1 ? 'was' : 'were'} only in this browser ${stats.removed === 1 ? 'was' : 'were'} removed.` : ''
    return `Restored. This browser now has the ${quotesText(stats.total)} from the backup.${removed}`
  }
  // Restoring the same file twice adds nothing: say so, instead of "Restored 0 quotes".
  if (stats.added === 0) return `Nothing new to add: every quote in the backup was already here.`
  const already = stats.duplicates > 0 ? ` ${stats.duplicates} ${stats.duplicates === 1 ? 'was' : 'were'} already here.` : ''
  return `Restored ${quotesText(stats.added)}.${already}`
}

/* A failed write, in words. "Nothing was changed" is only said when the
   rollback really put everything back. */
function writeErrorText(err) {
  const after = err.rolledBack
    ? ' Nothing was changed.'
    : ' Some data may be incomplete: restore the backup again and choose “Replace”.'
  // Firefox used its own name for a full storage before adopting the standard one.
  if (err.reason === 'QuotaExceededError' || err.reason === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return `There isn’t enough space in this browser for this backup.${after}`
  }
  if (err.reason === 'SecurityError') return `This browser is blocking storage for this site (private browsing?).${after}`
  return `The restore failed.${after}`
}

/* Shown above the history only when a backup is due (see backupStatus):
   something would be lost and the last backup is old or missing. */
export function BackupReminder({ quotes, lastBackupAt, onBackup }) {
  const status = backupStatus(quotes, lastBackupAt)
  // Not due: no banner at all, so it never becomes background noise.
  if (!status.due) return null
  const n = status.pending
  return (
    <aside className="backup-reminder no-print" aria-label="Backup reminder">
      <p>
        {status.hasBackup
          ? `${quotesText(n)} saved since your last backup on ${fmtDay(status.last)}. ${n === 1 ? 'It’s' : 'They’re'} only in this browser until you download a new one.`
          : `No backup yet. ${n === 1 ? 'Your quote is' : `Your ${n} quotes are`} stored only in this browser: clearing its data or switching computer would lose ${n === 1 ? 'it' : 'them'}.`}
      </p>
      <button type="button" className="controls primary" onClick={onBackup}>Download backup</button>
    </aside>
  )
}

export default function BackupPanel({ quotes, lastBackupAt, onBackup, onRestore }) {
  // The backup waiting for a decision: { fileName, backup, hasLocalData }, or null.
  const [pending, setPending] = useState(null)
  // Outcome of the last action: { kind: 'ok' | 'error', text }, or null.
  const [message, setMessage] = useState(null)
  // True while the file is read, so a second pick can't race the first.
  const [reading, setReading] = useState(false)
  const confirmRef = useRef(null)

  // When the decision box opens, focus moves into it: keyboard and
  // screen-reader users land on the question, not on the file button.
  useEffect(() => {
    if (pending) confirmRef.current?.focus()
  }, [pending])

  const status = backupStatus(quotes, lastBackupAt)
  // With no quotes and no business details there's nothing to save, and
  // an empty backup file would only be confusing.
  const canDownload = quotes.length > 0 || hasStoredSettings()
  // An empty History means a new browser: restoring is the main action.
  const isEmpty = quotes.length === 0

  const pickFile = async (file) => {
    // The picker was closed without choosing anything.
    if (!file) return
    setMessage(null)
    setPending(null)
    setReading(true)
    try {
      const backup = await readBackupFile(file)
      setPending({
        fileName: file.name,
        backup,
        // With nothing here, merge and replace end up the same, so a
        // single "Restore" button is shown instead of the choice.
        hasLocalData: quotes.length > 0 || hasStoredSettings(),
      })
    } catch (err) {
      // BackupError messages are written for the person; anything else is a bug.
      if (!(err instanceof BackupError)) console.error(err)
      setMessage({ kind: 'error', text: err instanceof BackupError ? err.message : 'Couldn’t read this file.' })
    } finally {
      setReading(false)
    }
  }

  const restore = (mode) => {
    const { backup } = pending
    if (mode === 'replace') {
      // Replace deletes the quotes that exist only here: count them and
      // ask first. When there are none, nothing is lost and no question is needed.
      const inFile = new Set(backup.quotes.map(q => q.id))
      const lost = quotes.filter(q => !inFile.has(q.id)).length
      if (lost > 0 && !window.confirm(`Replace this browser’s data with the backup?\n\n${quotesText(lost)} saved only in this browser will be deleted.`)) return
    }
    try {
      const stats = onRestore(backup, mode)
      setPending(null)
      setMessage({ kind: 'ok', text: restoredText(stats) })
    } catch (err) {
      console.error(err)
      // Storage errors carry whether the rollback worked; any other error
      // is thrown before writing (planning, reading), so nothing changed.
      setMessage({ kind: 'error', text: err instanceof StorageWriteError ? writeErrorText(err) : 'The restore failed. Nothing was changed.' })
    }
  }

  const { backup } = pending ?? {}

  return (
    <section className="panel backup no-print" aria-labelledby="backup-title">
      <h2 id="backup-title">Backup</h2>
      <div className="backup-body">
        <p>
          {isEmpty
            ? 'Coming from another computer or browser? Restore your layercents backup file here.'
            : 'Your quotes, business details and setup are stored only in this browser. Download a backup from time to time and keep it somewhere safe: you can restore it here or on any other computer.'}
        </p>

        {/* "Last backup" line: hidden on an empty, never-backed-up browser,
            where "No backup yet" would only be noise. */}
        {(!isEmpty || status.hasBackup) && (
          <p className="muted">
            {status.hasBackup ? `Last backup: ${fmtDateTime(status.last)}` : 'No backup yet.'}
            {status.hasBackup && (status.pending > 0 ? ` · ${quotesText(status.pending)} saved since` : ' · Up to date')}
          </p>
        )}

        <div className="backup-actions">
          {/* Gold only when the reminder above isn't showing: when a backup is
              due, the reminder already has the gold "Download backup", and two
              identical gold buttons on one screen look like two different things. */}
          {canDownload && (
            <button type="button" className={`controls ${status.due ? '' : 'primary'}`} onClick={onBackup}>Download backup</button>
          )}
          {/* A real <input type="file"> inside a styled label: the browser's own
              picker, keyboard included, without its unstyleable default button. */}
          <label className={`controls file-label ${isEmpty ? 'primary' : ''}`} aria-busy={reading}>
            {reading ? 'Reading…' : 'Restore from file'}
            <input
              type="file"
              // .json for desktop pickers, the MIME type for mobile ones.
              accept=".json,application/json"
              className="sr-only"
              disabled={reading}
              // Cleared after each pick, so choosing the same file again still fires onChange.
              onChange={e => { pickFile(e.target.files[0]); e.target.value = '' }}
            />
          </label>
        </div>

        {pending && (
          // tabIndex -1: focusable from code (the effect above) but not a Tab stop.
          <div className="backup-confirm" ref={confirmRef} tabIndex={-1} role="group" aria-labelledby="backup-confirm-title">
            <h3 id="backup-confirm-title">Restore this backup?</h3>
            <ul className="backup-facts">
              <li>
                {pending.fileName}
                {backup.exportedAt && <span className="muted">, made {fmtDateTime(new Date(backup.exportedAt))}</span>}
              </li>
              <li>
                {quotesText(backup.quotes.length)}
                {/* Damaged entries are skipped, never silently: the count is shown before anything is written. */}
                {backup.skipped > 0 && <span className="muted"> ({backup.skipped} damaged {backup.skipped === 1 ? 'one' : 'ones'} will be skipped)</span>}
              </li>
              {backup.business && <li>Business details{backup.business.logo ? ' and logo' : ''}</li>}
              {backup.counter && <li>Next quote number {quoteNumber(backup.counter)}</li>}
              {backup.setup && <li>Your setup (printer, electricity, rates)</li>}
            </ul>

            {pending.hasLocalData ? (
              <>
                <p className="muted">
                  {quotes.length > 0 ? `This browser already has ${quotesText(quotes.length)}.` : 'This browser already has saved settings.'}{' '}
                  <strong>Merge</strong> keeps everything here and adds what’s missing. <strong>Replace</strong> makes this browser match the file.
                </p>
                <div className="backup-actions">
                  {/* Merge is the default: it's the choice that can't lose anything. */}
                  <button type="button" className="controls primary" onClick={() => restore('merge')}>Merge</button>
                  <button type="button" className="controls" onClick={() => restore('replace')}>Replace</button>
                  <button type="button" className="controls" onClick={() => setPending(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <div className="backup-actions">
                <button type="button" className="controls primary" onClick={() => restore('replace')}>Restore</button>
                <button type="button" className="controls" onClick={() => setPending(null)}>Cancel</button>
              </div>
            )}
          </div>
        )}

        {/* Always in the page, so screen readers announce the text when it
            changes (a live region added at the same time as its text can go unread). */}
        <p className={message?.kind === 'error' ? 'form-error' : 'backup-done'} role="status">
          {message?.text}
        </p>
      </div>
    </section>
  )
}
