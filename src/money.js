/* ==================================================================
   MONEY IN THE FORM — what a person types in their own currency.

   The rule of the app: every amount is stored in EUR (the base currency of
   the exchange rates), and only converted to show it. Results already did
   that. The input fields didn't: they kept saying "€" and expected euros,
   even after choosing USD, so a US user typed $20 into a field that read
   it as €20.

   Why not store the numbers in the chosen currency instead: a saved quote,
   a backup and "Your setup" already hold euros. Changing what a number
   means would break every file people have downloaded and would need a
   migration. Converting at the edge (display and typing) changes nothing
   that is stored: with EUR chosen the rate is 1 and the form behaves
   exactly as before.

   Pure functions, so the tests can import them (node --test can't load .jsx).
================================================================== */

// The form shows at most 4 decimals. Enough for a price per kWh ($0.1638),
// and few enough that float noise (21.846000000000004) never reaches the input.
const DECIMALS = 4
const round = n => Math.round(n * 10 ** DECIMALS) / 10 ** DECIMALS

const usable = rate => (typeof rate === 'number' && Number.isFinite(rate) && rate > 0 ? rate : 1)

/* An amount stored in EUR -> what the field shows in the chosen currency. */
export const toDisplay = (eur, rate) => round((Number.isFinite(eur) ? eur : 0) * usable(rate))

/* What the person typed (in the chosen currency) -> the EUR that is stored. */
export const fromDisplay = (typed, rate) => (Number.isFinite(typed) ? typed : 0) / usable(rate)

/* The short symbol of a currency in the person's language: "$", "€", "£",
   "CA$", "kr". Falls back to the code when the browser doesn't know it. */
export function currencySymbol(code, locale) {
  try {
    const part = new Intl.NumberFormat(locale, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find(p => p.type === 'currency')
    return part?.value || code
  } catch {
    return code
  }
}
