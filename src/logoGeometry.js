/* ==================================================================
   LOGO GEOMETRY — the layers of the layercents mark, as plain data.

   It lives in its own file (and not inside Logo.jsx) because two things
   need the SAME numbers: the logo, which draws them in gold, and the
   cost chart (src/symbolChart.js), which paints them by cost. If each
   kept its own copy, changing the logo would silently break the chart.
   Plain data with no React import also lets `node --test` load it.
================================================================== */

// [x, y, width] of each layer, in a 100 × 100 box. The layers that cross
// the stroke of the cent sign are split in two, leaving a small gap.
export const FULL = [
  [29.4, 12.11, 15.5], [55.1, 12.11, 15.5],
  [17.18, 23.54, 27.72], [55.1, 23.54, 20.29],
  [11.67, 34.97, 19.53],
  [10, 46.4, 18],
  [11.67, 57.83, 19.53],
  [17.18, 69.26, 27.72], [55.1, 69.26, 20.29],
  [29.4, 80.69, 15.5], [55.1, 80.69, 15.5],
]
export const SMALL = [
  [22, 10, 20], [62, 10, 22],
  [10, 32, 26],
  [10, 54, 26],
  [22, 76, 20], [62, 76, 22],
]

// Bar height in the full mark. The corner radius is always half of it,
// so the bar ends are perfect semicircles.
export const FULL_HEIGHT = 7.2
export const SMALL_HEIGHT = 14
