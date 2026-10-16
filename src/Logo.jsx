/* ==================================================================
   LOGO — the layercents mark: a cent sign (¢) drawn with printed
   layers. The rounded bars are the layers that make the "C"; the
   light bar through them is the stroke of the cent sign.

   It is drawn in a 100 × 100 box, so the same drawing works at any
   size. `small` uses four thick layers instead of seven thin ones,
   so it still reads at 16–24 px (top bar, report, favicon).

   Colours come from CSS (.logo-layers and .logo-stroke in index.css),
   so the printed report can draw it darker on white paper.
================================================================== */

// [x, y, width] of each layer. The layers that cross the stroke are
// split in two, leaving a small gap on each side of it.
const FULL = [
  [29.4, 12.11, 15.5], [55.1, 12.11, 15.5],
  [17.18, 23.54, 27.72], [55.1, 23.54, 20.29],
  [11.67, 34.97, 19.53],
  [10, 46.4, 18],
  [11.67, 57.83, 19.53],
  [17.18, 69.26, 27.72], [55.1, 69.26, 20.29],
  [29.4, 80.69, 15.5], [55.1, 80.69, 15.5],
]
const SMALL = [
  [22, 10, 20], [62, 10, 22],
  [10, 32, 26],
  [10, 54, 26],
  [22, 76, 20], [62, 76, 22],
]

export default function Logo({ size = 24, small = false }) {
  const layers = small ? SMALL : FULL
  const height = small ? 14 : 7.2
  return (
    <svg className="logo" viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">
      <g className="logo-layers">
        {layers.map(([x, y, width]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={width} height={height} rx={height / 2} />
        ))}
      </g>
      {small
        ? <rect className="logo-stroke" x="45" y="2" width="14" height="96" rx="7" />
        : <rect className="logo-stroke" x="46.4" y="3" width="7.2" height="94" rx="3.6" />}
    </svg>
  )
}
