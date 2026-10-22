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

// The layer coordinates live in logoGeometry.js, shared with the cost
// chart (src/CostSymbol.jsx) so the two can never drift apart.
import { FULL, SMALL, FULL_HEIGHT, SMALL_HEIGHT } from './logoGeometry.js'

export default function Logo({ size = 24, small = false }) {
  const layers = small ? SMALL : FULL
  const height = small ? SMALL_HEIGHT : FULL_HEIGHT
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
