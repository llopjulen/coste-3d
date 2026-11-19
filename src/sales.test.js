/* Tests for sales.js. Run them with:  npm test */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultSale, normalizeSale, saleProfit, salesSummary, statusOf, withOrder, withStatus } from './sales.js'

const Q = { id: 1, cost: 5, price: 8, units: 4, orderTotal: 32, inputs: { fee: 10 } }

test('old quotes, with no status, are plain quotes', () => {
  assert.equal(statusOf({ id: 1, cost: 1, price: 2 }), 'quote')
})

test('a sale without a status counts as sold; "sold" without a sale does not', () => {
  assert.equal(statusOf({ ...Q, sale: { amount: 1, fees: 0 } }), 'sold')
  assert.equal(statusOf({ ...Q, status: 'sold' }), 'order')
  assert.equal(statusOf({ ...Q, status: 'nonsense' }), 'quote')
})

test('the sale form starts from the quoted total, its fee and today', () => {
  assert.deepEqual(defaultSale(Q, new Date('2026-11-04T10:00:00Z')), { amount: 32, fees: 3.2, channel: '', soldAt: '2026-11-04' })
})

test('real profit = received − fees − cost × parts', () => {
  const sold = withStatus(Q, 'sold', { amount: 30, fees: 2, channel: 'Etsy', soldAt: '2026-11-04' })
  assert.equal(saleProfit(sold), 30 - 2 - 5 * 4)
  assert.equal(saleProfit(Q), null)
})

test('going back from sold drops the sale', () => {
  const sold = withStatus(Q, 'sold', { amount: 30, fees: 2, channel: '', soldAt: '2026-11-04' })
  const back = withStatus(sold, 'order')
  assert.equal(back.status, 'order')
  assert.equal('sale' in back, false)
})

test('a bad sale is refused and the quote stays as it was', () => {
  assert.equal(withStatus(Q, 'sold', { amount: -3 }), Q)
  assert.equal(withStatus(Q, 'sold', null), Q)
  assert.equal(withStatus(Q, 'weird'), Q)
})

test('normalizeSale cleans what a file could carry', () => {
  assert.equal(normalizeSale('x'), null)
  assert.equal(normalizeSale({ amount: NaN }), null)
  const s = normalizeSale({ amount: 10.005, fees: 50, channel: '  ' + 'x'.repeat(60), soldAt: 'not a date', extra: 1 })
  assert.equal(s.amount, 10.01)
  assert.equal(s.fees, 10.01, 'fees can not be more than the amount')
  assert.equal(s.channel.length, 40)
  assert.ok(Number.isFinite(Date.parse(s.soldAt)))
  assert.equal('extra' in s, false)
})

test('summary: counts per state and the money of the sold ones', () => {
  const list = [
    Q,
    withStatus(Q, 'order'),
    withStatus(Q, 'sold', { amount: 30, fees: 3, soldAt: '2026-11-01' }),
    withStatus({ ...Q, units: 1, orderTotal: 8 }, 'sold', { amount: 10, fees: 1, soldAt: '2026-11-02' }),
  ]
  const s = salesSummary(list)
  assert.deepEqual(s.count, { quote: 1, order: 1, sold: 2 })
  assert.equal(s.revenue, 40)
  assert.equal(s.fees, 4)
  assert.equal(s.profit, (30 - 3 - 20) + (10 - 1 - 5))
  assert.equal(s.quoted, 40)
  assert.ok(Math.abs(s.margin - 11 / 40) < 1e-9)
  assert.equal(s.won, 3 / 4)
})

test('summary of nothing has no margin instead of NaN', () => {
  const s = salesSummary([])
  assert.equal(s.margin, null)
  assert.equal(s.won, null)
})

test('an order keeps its delivery date and when it was accepted; back to quote drops both', () => {
  const o = withOrder(Q, '2026-11-20', new Date('2026-11-04T08:00:00Z'))
  assert.equal(o.status, 'order'); assert.equal(o.dueAt, '2026-11-20'); assert.equal(o.orderedAt, '2026-11-04T08:00:00.000Z')
  assert.equal(withOrder(o, '2026-11-25').orderedAt, o.orderedAt, 'changing the date keeps the original acceptance')
  const sold = withStatus(o, 'sold', { amount: 30, fees: 0, soldAt: '2026-11-21' })
  assert.equal(sold.dueAt, '2026-11-20', 'the delivery date stays when sold')
  const back = withStatus(o, 'quote')
  assert.equal('dueAt' in back, false); assert.equal('orderedAt' in back, false)
  assert.equal('dueAt' in withOrder(Q, 'tomorrow'), false)
})
