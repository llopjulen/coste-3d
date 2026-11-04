import { useI18n } from './i18n/context.js'

/* ==================================================================
   PLANS — what is free and what the "Workshop" plan will add.

   The paid plan isn't on sale yet. This page says what it will be and
   measures who wants it: "I'm interested" is a plain link to a static
   page, /taller/ (public/taller/index.html). Cloudflare Web Analytics,
   already on the site, counts visits per page, so the visits to /taller/
   are the number of people who asked for it. No form, no email, no
   cookie, nothing about the person is stored: the count is all we learn.
   Why not a form: collecting emails needs a server (or a third-party
   form service) and a privacy notice; a click count needs neither and
   answers the question that matters now: does anyone want to pay?

   Prices are in EUR on purpose: that's what the payment page will charge.
   What goes in each plan comes from the private payment plan (2026-10-25,
   approved by Julen on 2026-11-04).
================================================================== */

const FREE = ['plans.free.f1', 'plans.free.f2', 'plans.free.f3', 'plans.free.f4', 'plans.free.f5']
const SHOP = ['plans.shop.f1', 'plans.shop.f2', 'plans.shop.f3', 'plans.shop.f4', 'plans.shop.f5']

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

export default function Plans() {
  const { t, lang } = useI18n()
  return (
    <main className="wrap">
      <h1>{t('plans.title')}</h1>
      <p className="subtitle">{t('plans.lead')}</p>

      <div className="plans">
        <section className="plan" aria-labelledby="plan-free">
          <h2 id="plan-free">{t('plans.free.name')}</h2>
          <p className="plan-price"><span className="amount">0 €</span></p>
          <p className="plan-for">{t('plans.free.for')}</p>
          <ul className="plan-list">
            {FREE.map(key => <li key={key}><Check />{t(key)}</li>)}
          </ul>
          <p className="plan-foot muted">{t('plans.free.foot')}</p>
        </section>

        <section className="plan plan-shop" aria-labelledby="plan-shop">
          <h2 id="plan-shop">{t('plans.shop.name')} <span className="soon">{t('plans.soon')}</span></h2>
          <p className="plan-price">
            <span className="amount">8 €</span><span className="per">{t('plans.perMonth')}</span>
          </p>
          <p className="plan-for">{t('plans.shop.year')}</p>
          <ul className="plan-list">
            {SHOP.map(key => <li key={key}><Check />{t(key)}</li>)}
          </ul>
          {/* A real link (not a button with JavaScript): the visit to /taller/
              is the measurement, and it also works with JavaScript off. */}
          <a className="controls primary plan-cta" href={`/taller/?lang=${lang}`}>{t('plans.interested')}</a>
          <p className="plan-foot muted">{t('plans.interestedNote')}</p>
        </section>
      </div>
    </main>
  )
}
