/* ==================================================================
   EXCEL EXPORT
   Turns the saved quotes into a formatted .xlsx file. It lives in its
   own file so App.jsx can load it only when the button is pressed:
   the Excel library is not downloaded until someone actually needs it.
================================================================== */
import writeExcelFile from 'write-excel-file/browser'

const HEADER_BG = '#212125'
const HEADER_TEXT = '#FFFFFF'
const ACCENT = '#00AE42'
const STRIPE_BG = '#F4F4F6'
const MONEY = '#,##0.00'

/* One entry per column. `get` reads the value from a saved quote;
   returning null leaves the cell empty (older quotes don't have
   every field). Money columns are multiplied by the exchange rate. */
function buildColumns(currency) {
  const money = label => `${label} (${currency})`
  return [
    { title: 'Date',          width: 12, type: Date,   format: 'yyyy-mm-dd', get: q => new Date(q.createdAt ?? q.id) },
    { title: 'Part',          width: 24, type: String, get: q => q.name ?? null },
    { title: 'Client',        width: 18, type: String, get: q => q.client || null },
    { title: 'Qty',           width: 6,  type: Number, format: '0', sum: true, get: q => q.units ?? 1 },
    { title: 'Weight (g)',    width: 11, type: Number, format: '0.0',
      get: q => (q.inputs ? q.inputs.partGrams + q.inputs.purgeGrams : null) },
    { title: 'Print time (h)', width: 13, type: Number, format: '0.00', get: q => q.inputs?.hours ?? null },
    { title: money('Material'),     width: 15, money: true, get: q => q.parts?.material ?? null },
    { title: money('Power'),        width: 13, money: true, get: q => q.parts?.power ?? null },
    { title: money('Depreciation'), width: 18, money: true, get: q => q.parts?.depreciation ?? null },
    { title: money('Failures'),     width: 14, money: true, get: q => q.parts?.failures ?? null },
    { title: money('Labor'),        width: 13, money: true, get: q => q.parts?.labor ?? null },
    { title: money('Packaging'),    width: 15, money: true, get: q => q.parts?.packaging ?? null },
    { title: money('Cost / part'),  width: 16, money: true, bold: true, get: q => q.cost },
    { title: 'Margin',        width: 9,  type: Number, format: '0%', get: q => (q.inputs ? q.inputs.margin / 100 : null) },
    { title: 'Fee',           width: 8,  type: Number, format: '0%', get: q => (q.inputs ? q.inputs.fee / 100 : null) },
    { title: money('Price / part'), width: 16, money: true, bold: true, accent: true, get: q => q.price },
    { title: money('Order total'),  width: 16, money: true, bold: true, sum: true,
      get: q => q.orderTotal ?? q.price },
  ]
}

// Column number -> Excel letter: 1 -> A, 17 -> Q.
const letter = n => String.fromCharCode(64 + n)

export async function exportQuotesToExcel(quotes, currency, rate) {
  const columns = buildColumns(currency)
  const titleRows = [
    [{ value: 'Print Cost — Saved quotes', fontWeight: 'bold', fontSize: 16, columnSpan: columns.length }],
    [{
      value: `Exported ${new Date().toISOString().slice(0, 10)} · ${quotes.length} quotes · amounts in ${currency}`,
      textColor: '#6E6E78',
      columnSpan: columns.length,
    }],
    [],
  ]

  const headerRow = columns.map(c => ({
    value: c.title,
    fontWeight: 'bold',
    textColor: HEADER_TEXT,
    backgroundColor: HEADER_BG,
    align: c.type === String || c.type === Date ? 'left' : 'right',
    wrap: true,
  }))

  const dataRows = quotes.map((q, i) =>
    columns.map(c => {
      let value = c.get(q)
      if (c.money && value != null) value = value * rate
      return {
        value: value ?? null,
        type: c.money ? Number : c.type,
        format: c.money ? MONEY : c.format,
        fontWeight: c.bold ? 'bold' : undefined,
        textColor: c.accent ? ACCENT : undefined,
        backgroundColor: i % 2 === 1 ? STRIPE_BG : undefined,
      }
    })
  )

  // The totals row uses real Excel formulas (=SUM(...)), so if you
  // edit a number in Excel the total updates by itself.
  const firstData = titleRows.length + 2
  const lastData = firstData + quotes.length - 1
  const totalRow = columns.map((c, i) => {
    const base = { fontWeight: 'bold', topBorderStyle: 'medium', topBorderColor: HEADER_BG }
    if (i === 0) return { ...base, value: 'Total' }
    if (!c.sum) return { ...base, value: null }
    const col = letter(i + 1)
    return { ...base, type: 'Formula', value: `SUM(${col}${firstData}:${col}${lastData})`, format: c.money ? MONEY : c.format }
  })

  await writeExcelFile(
    [...titleRows, headerRow, ...dataRows, totalRow],
    {
      columns: columns.map(c => ({ width: c.width })),
      sheet: 'Quotes',
      stickyRowsCount: titleRows.length + 1,
      fontFamily: 'Calibri',
      fontSize: 11,
    }
  ).toFile(`print-quotes-${new Date().toISOString().slice(0, 10)}.xlsx`)

}
