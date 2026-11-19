import { useI18n } from './i18n/context.js'
import { fmtMoney } from './i18n/format.js'

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

// The Workshop price, in EUR (what the payment page will charge).
// 8.99 a month; the year is 10 months' worth (89), "two months free".
export const SHOP_MONTH = 8.99
export const SHOP_YEAR = 89

/* One comparison table, not two pricing cards (2026-11-11). Two cards with
   a tick list each, a "Coming soon" pill and a gold border are the stock
   pricing-page template; and to compare the plans the person had to read
   two lists and work out the difference. A table puts each thing on one
   row with both answers side by side.

   A cell is true (included), false (not included) or the key of a text. */
const ROWS = [
  { key: 'plans.row.cost', free: true, shop: true },
  { key: 'plans.row.import', free: true, shop: true },
  { key: 'plans.row.history', free: true, shop: true },
  { key: 'plans.row.quote', free: true, shop: true },
  { key: 'plans.row.noFooter', free: false, shop: true },
  { key: 'plans.row.printers', free: 'plans.printers.single', shop: 'plans.printers.several' },
  { key: 'plans.row.jobs', free: false, shop: true },
  { key: 'plans.row.sync', free: false, shop: true },
  { key: 'plans.row.account', free: 'plans.account.none', shop: 'plans.yes' },
]

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

export default function Plans() {
  const { t, lang, locale } = useI18n()
  // Always EUR, whatever the currency selector says: it is what will be charged.
  // A round price loses its empty cents: "89 €", not "89,00 €".
  const eur = n => fmtMoney(locale, n, 'EUR').replace(/[.,]00(?!\d)/, '')
  // The tick and the dash are drawings: the word next to them (hidden on
  // screen) is what a screen reader says.
  const cell = value =>
    value === true ? <><Check /><span className="sr-only">{t('plans.yes')}</span></>
      : value === false ? <><span aria-hidden="true" className="muted">—</span><span className="sr-only">{t('plans.no')}</span></>
        : t(value)
  return (
    <main className="wrap">
      <h1>{t('plans.title')}</h1>

      <div className="panel plans-panel">
        <table className="plans-table">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">{t('plans.col.feature')}</span></th>
              <th scope="col">
                <span className="plan-name">{t('plans.free.name')}</span>
                <span className="plan-amount">{eur(0)}</span>
              </th>
              <th scope="col">
                <span className="plan-name">{t('plans.shop.name')}</span>
                <span className="plan-amount">{eur(SHOP_MONTH)}<span className="per"> {t('plans.perMonth')}</span></span>
                <span className="plan-sub">{t('plans.shop.year', { price: eur(SHOP_YEAR) })}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(row => (
              <tr key={row.key}>
                <th scope="row">{t(row.key)}</th>
                <td>{cell(row.free)}</td>
                <td>{cell(row.shop)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="plans-cta">
        <p className="muted">{t('plans.cta.note')}</p>
        {/* A real link (not a button with JavaScript): the visit to /taller/
            is the measurement, and it also works with JavaScript off. */}
        <a className="controls primary" href={`/taller/?lang=${lang}`}>{t('plans.interested')}</a>
      </div>
    </main>
  )
}
