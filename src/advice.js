/* ==================================================================
   ADVICE — short, concrete tips from the numbers on screen.

   Not AI: plain rules, each one tied to a number the person typed and to
   a figure worked out from it ("the fee takes 1.20 per part; selling
   direct, the same profit costs the buyer 8.10"). Rules are cheap, run in
   the browser, cost nothing per use and can be tested one by one; a
   language model would need a server and an API key (see docs/NUBE.md)
   and could make up numbers. These rules are the base an AI assistant
   would build on later.

   Each tip is { id, priority, vars }: `id` picks the text (advice.<id> in
   the dictionaries), `vars` are raw numbers (money in EUR, like the rest of
   the app; the screen converts and formats them). At most MAX_TIPS are
   shown, most important first: a wall of tips is read as noise.
================================================================== */
import { calculate } from './calculate.js'

export const MAX_TIPS = 3

const finite = n => typeof n === 'number' && Number.isFinite(n)

export function adviceFor(d) {
  const r = calculate(d)
  const tips = []
  if (!(r.cost > 0)) return tips

  // 1. Selling below the recommended price, but not at a loss (the loss is
  //    already the red sentence under the price): what margin is left really.
  if (r.profit >= 0 && d.currentPrice > 0 && d.currentPrice < r.recommendedPrice * 0.97) {
    tips.push({
      id: 'underpriced',
      priority: 1,
      vars: {
        gap: Math.round((1 - d.currentPrice / r.recommendedPrice) * 100),
        realMargin: Math.round((r.profit / r.cost) * 100),
        margin: d.margin,
      },
    })
  }

  // 2. No failures at all: every slicer user knows that's not true, and the
  //    failed prints are then paid out of the profit without anyone seeing it.
  if (d.failRate === 0) tips.push({ id: 'noFailures', priority: 2, vars: {} })

  // 3. The person's time counts as free.
  if (d.postMinutes > 0 && !(d.hourlyRate > 0)) {
    tips.push({ id: 'freeTime', priority: 3, vars: { minutes: d.postMinutes } })
  }

  // 4. A thin margin: how many good parts one broken or returned part wipes out.
  //    (Only when there IS a profit to wipe out.)
  if (d.margin < 15 && r.recommendedProfit > 0) {
    tips.push({ id: 'lowMargin', priority: 4, vars: { margin: d.margin, parts: Math.ceil(r.cost / r.recommendedProfit) } })
  }

  // 5. A high platform fee: what it takes per part, and the price for the
  //    same profit when selling direct (no fee).
  if (d.fee >= 10) {
    const direct = calculate({ ...d, fee: 0 }).recommendedPrice
    tips.push({ id: 'fee', priority: 5, vars: { fee: d.fee, takes: r.recommendedPrice - direct, direct } })
  }

  // 6. Labour is most of the cost: batching parts on one plate is where the
  //    price can drop, because the post-processing per part usually does.
  const laborShare = r.parts.labor / r.cost
  if (finite(laborShare) && laborShare >= 0.4) {
    tips.push({ id: 'laborHeavy', priority: 6, vars: { share: Math.round(laborShare * 100) } })
  }

  return tips.sort((a, b) => a.priority - b.priority).slice(0, MAX_TIPS)
}
