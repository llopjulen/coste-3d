/* ==================================================================
   COST SYMBOL — the breakdown chart: the layercents mark "printed" in
   the colour of each cost. Material fills the bottom layers, packaging
   the top ones. The maths is in symbolChart.js; this file only draws.
================================================================== */
import { useId } from 'react'
import { symbolPieces } from './symbolChart.js'
import { FULL_HEIGHT } from './logoGeometry.js'

/* `layers` is the list of { key, color, name }, in print order (bottom
   to top). `label` is the text a screen reader gets instead of the
   picture: the colours alone tell a blind person nothing. */
export default function CostSymbol({ parts, layers, label }) {
  // Several of these can be on screen at once (calculator and report), and
  // an id in the page must be unique or url(#id) grabs the wrong clipPath.
  // useId gives each instance its own stable prefix.
  const uid = useId()
  const keys = layers.map(layer => layer.key)
  const color = Object.fromEntries(layers.map(layer => [layer.key, layer.color]))
  const segments = symbolPieces(parts, keys)

  return (
    <svg className="cost-symbol" viewBox="0 0 100 100" role="img" aria-label={label}>
      {/* One clipPath per layer: the rounded bar. Everything painted in
          that layer is cut to it, so the outer ends stay round and the
          cut between two colours stays straight. */}
      <defs>
        {segments.map((s, i) => (
          <clipPath id={`${uid}-${i}`} key={i}>
            <rect x={s.x} y={s.y} width={s.width} height={FULL_HEIGHT} rx={FULL_HEIGHT / 2} />
          </clipPath>
        ))}
      </defs>

      {segments.map((s, i) => (
        <g key={i}>
          {/* Empty bar underneath: the shape of the mark stays readable
              even when a cost is 0 or the form is empty. */}
          <rect className="cost-symbol-empty" x={s.x} y={s.y} width={s.width} height={FULL_HEIGHT} rx={FULL_HEIGHT / 2} />
          <g clipPath={`url(#${uid}-${i})`}>
            {/* Always one rect per cost, even at width 0: the same element
                moves instead of appearing and disappearing, and that's
                what lets CSS animate the boundaries when a number changes. */}
            {keys.map(key => (
              <rect
                key={key}
                className="cost-symbol-piece"
                x={s.x + s.pieces[key].from}
                y={s.y}
                width={s.pieces[key].width}
                height={FULL_HEIGHT}
                fill={color[key]}
              />
            ))}
          </g>
        </g>
      ))}

      {/* The stroke of the cent sign, same as in the logo. */}
      <rect className="logo-stroke" x="46.4" y="3" width="7.2" height="94" rx="3.6" />
    </svg>
  )
}
