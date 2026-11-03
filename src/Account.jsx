import { useEffect, useState } from 'react'
import { CloudError, adapter, cloudMode, looksLikeEmail } from './cloud/session.js'
import { useI18n } from './i18n/context.js'

/* ==================================================================
   ACCOUNT — sign in with a link by email, see who you are, sign out,
   delete the account. docs/NUBE.md, PR step 3: no syncing yet.

   It only talks to cloud/session.js, so it works the same with the mock
   (?cloud=mock) and with Julen's Supabase adapter. App.jsx shows the tab
   only when cloudMode() isn't 'off'.

   Why a link by email and not a password: no password to store, to leak
   or to reset, and the person proves they own the address. It's what
   docs/NUBE.md chose.
================================================================== */
export default function Account() {
  const { t } = useI18n()
  const cloud = adapter()
  const [session, setSession] = useState(undefined) // undefined = still asking
  const [email, setEmail] = useState('')
  const [step, setStep] = useState('form') // form | sending | sent
  const [sentTo, setSentTo] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!cloud) return undefined
    let alive = true
    cloud.getSession().then(s => { if (alive) setSession(s) })
    const stop = cloud.onChange(s => { if (alive) { setSession(s); setStep('form') } })
    return () => { alive = false; stop() }
  }, [cloud])

  const explain = err => {
    if (!(err instanceof CloudError)) console.error(err)
    const key = `account.err.${err instanceof CloudError ? err.code : 'network'}`
    const text = t(key)
    return text === key ? t('account.err.network') : text
  }

  const send = async e => {
    e.preventDefault()
    setError('')
    if (!looksLikeEmail(email)) { setError(t('account.err.email')); return }
    setStep('sending')
    try {
      await cloud.sendLink(email.trim())
      setSentTo(email.trim())
      setStep('sent')
    } catch (err) {
      setError(explain(err))
      setStep('form')
    }
  }

  const act = async (fn) => {
    setBusy(true)
    setError('')
    try { await fn() } catch (err) { setError(explain(err)) } finally { setBusy(false) }
  }
  const signOut = () => act(() => cloud.signOut())
  const remove = () => {
    if (!window.confirm(t('account.deleteConfirm'))) return
    act(() => cloud.deleteAccount())
  }

  if (!cloud) return null

  return (
    <main className="wrap account-page">
      <h1>{t('account.title')}</h1>
      <p className="subtitle">{t('account.lead')}</p>
      {cloudMode() === 'mock' && <p className="account-mock">{t('account.mock')}</p>}

      <section className="panel account-panel" aria-live="polite">
        {session === undefined ? (
          <p className="body muted">{t('account.loading')}</p>
        ) : session ? (
          <div className="body account-body">
            <p className="account-who">{t('account.signedInAs')} <strong>{session.email}</strong></p>
            <p className="muted">{t('account.syncSoon')}</p>
            <div className="account-actions">
              <button type="button" className="controls" disabled={busy} onClick={signOut}>{t('account.signOut')}</button>
              <button type="button" className="link danger-link" disabled={busy} onClick={remove}>{t('account.delete')}</button>
            </div>
          </div>
        ) : step === 'sent' ? (
          <div className="body account-body">
            <h2 className="account-h">{t('account.checkInbox')}</h2>
            <p>{t('account.sentTo', { email: sentTo })}</p>
            <p className="muted">{t('account.sentHint')}</p>
            <button type="button" className="link" onClick={() => setStep('form')}>{t('account.useOther')}</button>
          </div>
        ) : (
          <form className="body account-body" onSubmit={send} noValidate>
            <h2 className="account-h">{t('account.signIn')}</h2>
            <label htmlFor="account-email">{t('account.emailLabel')}</label>
            <div className="account-row">
              <input
                id="account-email"
                className="text-input"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder={t('account.emailPh')}
                value={email}
                onChange={e => setEmail(e.target.value)}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby="account-email-note"
              />
              <button type="submit" className="controls primary" disabled={step === 'sending'}>
                {step === 'sending' ? t('account.sending') : t('account.sendLink')}
              </button>
            </div>
            <p id="account-email-note" className="muted">{t('account.noPassword')}</p>
          </form>
        )}
        {error && <p className="body import-error" role="alert">{error}</p>}
      </section>

      <p className="account-foot muted">{t('account.withoutAccount')}</p>
    </main>
  )
}
