/* ==================================================================
   COST PRINT — the maths behind the 3D cost object (CostPrint.jsx).

   The object is a small vase "printed" in N layers. Each cost part
   (material, power, labor…) gets a band of layers as thick as its share
   of the cost, bottom to top in the fixed order of LAYERS. This file
   only decides which part each layer belongs to; it knows nothing about
   three.js, so it is tested with plain node:test.
================================================================== */

/* [{ key, color }], { key: amount } and N  ->  an array of N indices into
   `layers`, bottom layer first. [] when there is no cost to show.

   Largest-remainder rounding (the method used to hand out seats in
   proportional elections): every part gets floor(share × N) layers, and
   the layers left over go to the parts with the biggest fractions. Plain
   rounding could add up to N − 1 or N + 1. A part with any cost at all
   gets at least one layer, so a 0.5 % part is still visible. */
export function layerBands(layers, parts, n) {
  const amounts = layers.map(l => Math.max(Number(parts?.[l.key]) || 0, 0))
  const total = amounts.reduce((s, v) => s + v, 0)
  if (!(total > 0) || n < 1) return []
  const exact = amounts.map(v => (v / total) * n)
  const counts = exact.map((e, i) => (amounts[i] > 0 ? Math.max(Math.floor(e), 1) : 0))
  let left = n - counts.reduce((s, v) => s + v, 0)
  // Biggest fraction first; ties go to the earlier part so the result is stable.
  const byFraction = exact.map((e, i) => i).filter(i => amounts[i] > 0)
    .sort((a, b) => (exact[b] - Math.floor(exact[b])) - (exact[a] - Math.floor(exact[a])) || a - b)
  for (let k = 0; left > 0; k++, left--) counts[byFraction[k % byFraction.length]]++
  // The "at least one" rule can overshoot when many tiny parts exist: take
  // the extra layers back from the thickest band.
  while (left < 0) { counts[counts.indexOf(Math.max(...counts))]--; left++ }
  return counts.flatMap((c, i) => Array(c).fill(i))
}

/* Where each part's band ends on the dropped part, as a fraction of its
   height: cumulative shares, bottom to top. { a: 1, b: 3 } -> [0.25, 1].
   A part with no cost ends where the one before ended (a band of zero
   height). [] when there is no cost. Unlike layerBands this is not
   rounded to whole layers: the shader paints any height. */
export function bandStops(layers, parts) {
  const amounts = layers.map(l => Math.max(Number(parts?.[l.key]) || 0, 0))
  const total = amounts.reduce((s, v) => s + v, 0)
  if (!(total > 0)) return []
  let sum = 0
  return amounts.map(v => (sum += v) / total)
}
