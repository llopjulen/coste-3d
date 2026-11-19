/* ==================================================================
   PRINTER PRESETS — the average power of known printers, so nobody has
   to guess the "Power" field of "Your setup".

   Why only the power: it is the number people don't know (the label on
   the power supply says 350 W, but a printer averages a third of that
   while printing). The printer's price changes with offers and country,
   so it stays a number the person types.

   Why only Bambu Lab for now: every value here must come from the
   maker's published figure, not from a guess. Bambu Lab publishes the
   average power while printing PLA for each model (SOURCE below). Other
   brands get added when a published figure is found; until then, "Other"
   leaves the field as it is.

   Pure data and one helper; App renders the <select>.
================================================================== */

export const SOURCE = 'https://wiki.bambulab.com/en/general/power-consumption'

// Average watts while printing PLA, from SOURCE (checked 2026-11-06).
export const PRINTER_PRESETS = [
  { id: 'bambu-a1-mini', name: 'Bambu Lab A1 mini', watts: 80 },
  { id: 'bambu-a1', name: 'Bambu Lab A1', watts: 95 },
  { id: 'bambu-p1p', name: 'Bambu Lab P1P', watts: 110 },
  { id: 'bambu-p1s', name: 'Bambu Lab P1S', watts: 105 },
  { id: 'bambu-x1c', name: 'Bambu Lab X1 Carbon', watts: 105 },
  { id: 'bambu-x1e', name: 'Bambu Lab X1E', watts: 185 },
  { id: 'bambu-h2d', name: 'Bambu Lab H2D', watts: 197 },
]

/* The preset with that id, or null ("Other", or an id from an old link). */
export const presetById = id => PRINTER_PRESETS.find(p => p.id === id) ?? null
