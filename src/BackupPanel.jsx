import { useEffect, useRef, useState } from 'react'
import { useI18n } from './i18n/context.js'
import { fmtDateTime, fmtDay } from './i18n/format.js'
import { BackupError, StorageWriteError, backupStatus, hasStoredSettings, readBackupFile } from './backup.js'

/* ==================================================================
   BACKUP — the panel at the bottom of History and the reminder at
   the top. App owns the data; these components only show it and
   report what the person chose (onBackup, onRestore).
   Restore is two steps on purpose: pick a file -> see what's in it ->
   choose merge or replace. Nothing is written before that choice.
================================================================== */

// Same format CustomerQuote gives the default number, so the summary
// shows exactly what the next quote will be called: 2026-007.
const quoteNumber = n => `${new Date().getFullYear()}-${String(n).padStart(3, '0')}`

/* The line shown after a restore, from planRestore's stats.
   `tp` pluralises ("1 quote" / "5 quotes"): each language has its own rules. */
function restoredText(stats, { t, tp }) {
  if (stats.mode === 'replace') {
    // Say what was deleted: replace is the only action that removes quotes.
    const removed = stats.removed > 0 ? tp('backup.done.removed', stats.removed) : ''
    return t('backup.done.replace', { count: tp('count.quotes', stats.total) }) + removed
  }
  // Restoring the same file twice adds nothing: say so, instead of "Restored 0 quotes".
  if (stats.added === 0) return t('backup.done.nothingNew')
  const already = stats.duplicates > 0 ? tp('backup.done.dup', stats.duplicates) : ''
  return t('backup.done.added', { count: tp('count.quotes', stats.added) }) + already
}

/* A failed write, in words. "Nothing was changed" is only said when the
   rollback really put everything back. */
function writeErrorText(err, { t }) {
  const after = err.rolledBack ? t('backup.err.rolledBack') : t('backup.err.partial')
  // Firefox used its own name for a full storage before adopting the standard one.
  if (err.reason === 'QuotaExceededError' || err.reason === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return t('backup.err.noSpace', { after })
  }
  if (err.reason === 'SecurityError') return t('backup.err.blocked', { after })
  return t('backup.err.failedWrite', { after })
}

/* A BackupError from backup.js: its code picks the translated text; the
   English message is only the fallback for a code this screen doesn't know. */
function backupErrorText(err, { t }) {
  const key = `backupError.${err.code}`
  const text = err.code ? t(key) : err.message
  return text === key ? err.message : text
}

/* Shown above the history only when a backup is due (see backupStatus):
   something would be lost and the last backup is old or missing. */
export function BackupReminder({ quotes, lastBackupAt, onBackup }) {
  const { t, tp, locale } = useI18n()
  const status = backupStatus(quotes, lastBackupAt)
  // Not due: no banner at all, so it never becomes background noise.
  if (!status.due) return null
  const n = status.pending
  return (
    /* One quiet line with a link (2026-11-11). It used to be a box with a
       gold button, the loudest thing in History, for something that is not
       what the person came to do. The gold dot stays: it is the same one
       that marks the tab. */
    <aside className="backup-reminder no-print" aria-label={t('backup.reminder.label')}>
      <p>
        {status.hasBackup
          ? tp('backup.reminder.since', n, { date: fmtDay(locale, status.last) })
          : tp('backup.reminder.none', n)}
        {' '}<button type="button" className="link" onClick={onBackup}>{t('backup.download')}</button>
      </p>
    </aside>
  )
}

export default function BackupPanel({ quotes, lastBackupAt, onBackup, onRestore }) {
  const i18n = useI18n()
  const { t, tr, tp, locale } = i18n
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
      setMessage({ kind: 'error', text: err instanceof BackupError ? backupErrorText(err, i18n) : t('backup.err.read') })
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
      if (lost > 0 && !window.confirm(t('backup.confirmReplace', { count: tp('count.quotes', lost) }))) return
    }
    try {
      const stats = onRestore(backup, mode)
      setPending(null)
      setMessage({ kind: 'ok', text: restoredText(stats, i18n) })
    } catch (err) {
      console.error(err)
      // Storage errors carry whether the rollback worked; any other error
      // is thrown before writing (planning, reading), so nothing changed.
      setMessage({ kind: 'error', text: err instanceof StorageWriteError ? writeErrorText(err, i18n) : t('backup.err.failed') })
    }
  }

  const { backup } = pending ?? {}

  return (
    <section className="panel backup no-print" aria-labelledby="backup-title">
      <h2 id="backup-title">{t('backup.title')}</h2>
      <div className="backup-body">
        <p>
          {isEmpty
            ? t('backup.intro.empty')
            : t('backup.intro.full')}
        </p>

        {/* "Last backup" line: hidden on an empty, never-backed-up browser,
            where "No backup yet" would only be noise. */}
        {status.hasBackup && (
          <p className="muted">
            {t('backup.last', { date: fmtDateTime(locale, status.last) })}
            {status.hasBackup && (status.pending > 0 ? t('backup.savedSince', { count: tp('count.quotes', status.pending) }) : t('backup.upToDate'))}
          </p>
        )}

        <div className="backup-actions">
          {/* Gold only when the reminder above isn't showing: when a backup is
              due, the reminder already has the gold "Download backup", and two
              identical gold buttons on one screen look like two different things. */}
          {canDownload && (
            <button type="button" className="controls" onClick={onBackup}>{t('backup.download')}</button>
          )}
          {/* A real <input type="file"> inside a styled label: the browser's own
              picker, keyboard included, without its unstyleable default button. */}
          <label className="controls file-label" aria-busy={reading}>
            {reading ? t('backup.reading') : t('backup.restoreFile')}
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
            <h3 id="backup-confirm-title">{t('backup.confirm.title')}</h3>
            <ul className="backup-facts">
              <li>
                {pending.fileName}
                {backup.exportedAt && <span className="muted">{t('backup.fact.madeOn', { date: fmtDateTime(locale, new Date(backup.exportedAt)) })}</span>}
              </li>
              <li>
                {tp('count.quotes', backup.quotes.length)}
                {/* Damaged entries are skipped, never silently: the count is shown before anything is written. */}
                {backup.skipped > 0 && <span className="muted"> {tp('backup.fact.damaged', backup.skipped)}</span>}
              </li>
              {backup.business && <li>{backup.business.logo ? t('backup.fact.businessLogo') : t('backup.fact.business')}</li>}
              {backup.counter && <li>{t('backup.fact.counter', { number: quoteNumber(backup.counter) })}</li>}
              {backup.setup && <li>{t('backup.fact.setup')}</li>}
            </ul>

            {pending.hasLocalData ? (
              <>
                <p className="muted">
                  {quotes.length > 0 ? t('backup.hasQuotes', { count: tp('count.quotes', quotes.length) }) : t('backup.hasSettings')}{' '}
                  {tr('backup.mergeHelp', {}, { merge: <strong>{t('backup.merge')}</strong>, replace: <strong>{t('backup.replace')}</strong> })}
                </p>
                <div className="backup-actions">
                  {/* Merge is the default: it's the choice that can't lose anything. */}
                  <button type="button" className="controls primary" onClick={() => restore('merge')}>{t('backup.merge')}</button>
                  <button type="button" className="controls" onClick={() => restore('replace')}>{t('backup.replace')}</button>
                  <button type="button" className="controls" onClick={() => setPending(null)}>{t('backup.cancel')}</button>
                </div>
              </>
            ) : (
              <div className="backup-actions">
                <button type="button" className="controls primary" onClick={() => restore('replace')}>{t('backup.restore')}</button>
                <button type="button" className="controls" onClick={() => setPending(null)}>{t('backup.cancel')}</button>
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
