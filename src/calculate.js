/* ==================================================================
   CALCULATION — a pure function: numbers in, numbers out.
   It knows nothing about React or the screen. It lives in its own file
   (it used to be inside App.jsx) so the tests can import it: `node --test`
   can't load a .jsx file.

   Several filaments per part
   --------------------------
   The first filament keeps the fields it always had (spoolPrice,
   spoolWeight, partGrams, purgeGrams). Every other filament of the part is
   an entry of `extraFilaments`: { id, label, spoolPrice, spoolWeight, grams }.
   Why not turn the first one into an array too: quotes saved before this
   existed, and backup files people already downloaded, have no array. With
   the first filament left alone and the rest optional, an old quote is
   exactly "a part with no extra filaments": no migration, no new
   BACKUP_SCHEMA_VERSION, and the same price as before to the cent.
================================================================== */

// A Bambu AMS holds 4 spools and a second one chains to 8: seven extras
// plus the first filament. It also keeps a restored backup from carrying
// thousands of rows.
export const MAX_EXTRA_FILAMENTS = 7

const finite = n => typeof n === 'number' && Number.isFinite(n)

/* What one gram of a spool costs. 0 for a spool with no weight, instead of
   Infinity or NaN: a half-typed form must never print "NaN EUR". */
export function pricePerGram(spoolPrice, spoolWeight) {
  return finite(spoolPrice) && finite(spoolWeight) && spoolWeight > 0 ? spoolPrice / spoolWeight : 0
}

/* The extra filaments of a set of inputs, always as an array (old quotes
   have none) and without entries that aren't objects. */
export function extrasOf(inputs) {
  const list = inputs?.extraFilaments
  return Array.isArray(list) ? list.filter(f => f && typeof f === 'object') : []
}

const cleanNumber = n => (finite(n) && n >= 0 ? n : 0)

/* Any value -> a clean `extraFilaments` array: objects only, at most
   MAX_EXTRA_FILAMENTS, numbers that are finite and not negative (otherwise 0),
   a short text label and ids 1, 2, 3… (React keys and the handle for delete;
   renumbering also repairs a hand-edited file with repeated ids). Used when a
   quote is loaded and when a backup is restored, so the shape is defined once. */
export function normalizeExtras(list) {
  if (!Array.isArray(list)) return []
  return list
    .filter(f => f && typeof f === 'object' && !Array.isArray(f))
    .slice(0, MAX_EXTRA_FILAMENTS)
    .map((f, i) => ({
      id: i + 1,
      label: typeof f.label === 'string' ? f.label.slice(0, 40) : '',
      spoolPrice: cleanNumber(f.spoolPrice),
      spoolWeight: cleanNumber(f.spoolWeight),
      grams: cleanNumber(f.grams),
    }))
}

/* Grams of every filament of one part: part + purge + the extras. */
export function totalGrams(inputs) {
  const own = (finite(inputs?.partGrams) ? inputs.partGrams : 0) + (finite(inputs?.purgeGrams) ? inputs.purgeGrams : 0)
  return own + extrasOf(inputs).reduce((sum, f) => sum + (finite(f.grams) ? f.grams : 0), 0)
}

/* What the filament of one part costs. The purge is priced at the first
   filament's price: it is a mix, and nobody knows its real price. */
export function materialCost(d) {
  const first = (d.partGrams + d.purgeGrams) * pricePerGram(d.spoolPrice, d.spoolWeight)
  return extrasOf(d).reduce((sum, f) => sum + (finite(f.grams) ? f.grams : 0) * pricePerGram(f.spoolPrice, f.spoolWeight), first)
}

export function calculate(d) {
  const material = materialCost(d)
  const power = (d.watts / 1000) * d.hours * d.kwhPrice
  const depreciation = d.lifespan > 0 ? d.hours * (d.printerPrice / d.lifespan) : 0

  // If 8 out of 100 prints go to the bin, the 92 good ones have to
  // cover the material and hours spent on the 8 failed ones.
  const failures = (material + power + depreciation) * (d.failRate / 100)

  const labor = (d.postMinutes / 60) * d.hourlyRate
  const packaging = d.packaging

  const parts = { material, power, depreciation, failures, labor, packaging }
  const cost = Object.values(parts).reduce((a, b) => a + b, 0)

  // The platform fee is taken from the FINAL price, not from your
  // cost: that's why we DIVIDE by (1 - fee) instead of multiplying.
  const f = Math.min(Math.max(d.fee, 0) / 100, 0.95)
  const recommendedPrice = (cost * (1 + d.margin / 100)) / (1 - f)

  // What you keep per part at the RECOMMENDED price, once the platform
  // has taken its fee. (The "profit" below is at your CURRENT price.)
  const recommendedProfit = recommendedPrice * (1 - f) - cost

  const currentNet = d.currentPrice * (1 - f)
  const profit = currentNet - cost
  const perHour = d.hours > 0 ? profit / d.hours : 0
  const units = Math.max(Math.floor(d.quantity), 1)

  return {
    parts, cost, recommendedPrice, recommendedProfit, profit, perHour, currentNet, units,
    orderPrice: recommendedPrice * units,
    materialPct: cost > 0 ? (material / cost) * 100 : 0,
  }
}

/* How much the printer can turn out in a week, from the hours it really runs.
   Pure and separate from `calculate`: it doesn't change any price, it answers
   "how many of these can I make?".
   - A failed print uses printer time and gives no part, so only
     (1 - failRate) of the prints are good parts. The 0.95 ceiling is the same
     one `calculate` uses for the fee: a rate of 100 % must not divide by zero.
   - `orderDays` is how long the whole order (`quantity` parts) takes at that
     weekly rhythm, counting the extra prints the failures cost. Days of
     printing, not of delivery: it ignores post-processing and shipping.
   Returns null while a number needed is missing (0 hours per print, no hours
   per week), so the screen simply hides the line instead of printing Infinity. */
export function capacity(d) {
  const weekHours = finite(d.printHoursPerWeek) ? d.printHoursPerWeek : 0
  const hours = finite(d.hours) ? d.hours : 0
  if (weekHours <= 0 || hours <= 0) return null
  const ok = 1 - Math.min(Math.max(finite(d.failRate) ? d.failRate : 0, 0) / 100, 0.95)
  const units = Math.max(Math.floor(finite(d.quantity) ? d.quantity : 1), 1)
  return {
    goodPerWeek: (weekHours / hours) * ok,
    orderDays: ((units * hours) / ok) / (weekHours / 7),
  }
}
