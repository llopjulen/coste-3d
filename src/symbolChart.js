/* ==================================================================
   SYMBOL CHART — turns costs into pieces of the layercents mark.

   Idea: the mark is 11 printed layers. We "print" the cost breakdown
   into it like a real part: the first cost (material) fills the bottom
   layers, the next one continues where it stopped, and so on up to the
   top. Each cost gets a share of the TOTAL LENGTH of all the layers
   equal to its share of the total cost.

   This file is a pure function (numbers in, numbers out), like
   calculate() in App.jsx: it doesn't know React or the screen, so it
   can be tested on its own (src/symbolChart.test.js).

   Why length and not area: every layer has the same height, so length
   is proportional to area, and a share of length is a share of ink.
================================================================== */
import { FULL } from './logoGeometry.js'

// Tolerance for comparing floats: 0.1 + 0.2 !== 0.3 in JavaScript, so
// "is this boundary exactly on the edge of a layer?" can't use ===.
const EPS = 1e-9

/* The layers in the order they get "printed": bottom row first (largest
   y is lowest on screen), and within a row, left before right.
   Sorting a copy ([...layers]) keeps the original array untouched. */
export function printOrder(layers = FULL) {
  return [...layers]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([x, y, width]) => ({ x, y, width }))
}

/* Splits `parts` ({ material: 0.9, power: 0.06, ... }) over the layers.

   `keys` is the order of the costs, bottom to top. `gap` is the visible
   space (in logo units) left between two colours that share one layer.

   Returns one entry per layer, in print order:
     { x, y, width, pieces: { material: { from, width }, ... } }
   `from` is measured from the left end of THAT layer. A cost with no
   piece in a layer still gets { from: 0, width: 0 }: the component
   always draws the same elements, so React can animate them instead of
   creating and destroying them (animating needs the same element). */
export function symbolPieces(parts, keys, { layers = FULL, gap = 0.6 } = {}) {
  const segments = printOrder(layers)
  const totalLength = segments.reduce((sum, s) => sum + s.width, 0)

  // Only real, positive numbers count: a NaN (empty field) or a negative
  // cost would otherwise poison the whole sum.
  const amounts = keys.map(key => {
    const value = Number(parts[key])
    return Number.isFinite(value) && value > 0 ? value : 0
  })
  const total = amounts.reduce((sum, v) => sum + v, 0)

  // Where each cost starts and ends along the unrolled layers (0..totalLength).
  let cumulative = 0
  const spans = amounts.map((amount, i) => {
    const start = (cumulative / total) * totalLength
    cumulative += amount
    // The last cost is closed at exactly totalLength: adding floats leaves
    // dust like 214.99999999, which would show as a hairline gap.
    const end = i === amounts.length - 1 ? totalLength : (cumulative / total) * totalLength
    return { start, end, amount }
  })

  let offset = 0 // where the current layer begins, along the unrolled layers
  return segments.map(segment => {
    const segStart = offset
    const segEnd = offset + segment.width
    offset = segEnd

    const pieces = {}
    keys.forEach((key, i) => {
      const { start, end, amount } = spans[i]
      // No cost at all (total 0) or this cost is 0: nothing to draw.
      if (total <= 0 || amount <= 0) {
        pieces[key] = { from: 0, width: 0 }
        return
      }
      // Overlap of [start, end] (the cost) with [segStart, segEnd] (the layer).
      let lo = Math.max(start, segStart)
      let hi = Math.min(end, segEnd)
      if (hi - lo <= EPS) {
        pieces[key] = { from: 0, width: 0 }
        return
      }
      // A gap only goes where two colours meet INSIDE this layer. At the
      // ends of the layer there is nothing next to it, and the rounded
      // end must stay full.
      if (lo > segStart + EPS) lo += gap / 2
      if (hi < segEnd - EPS) hi -= gap / 2
      pieces[key] = { from: lo - segStart, width: Math.max(0, hi - lo) }
    })
    return { ...segment, pieces }
  })
}
