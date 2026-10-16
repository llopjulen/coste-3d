import { useEffect, useRef, useState } from 'react'
import { readSlicedFile, formValuesFromPlates, ImportError } from './slicerFile.js'

/* 4443 seconds -> "1h 14m" */
function formatDuration(seconds) {
  const minutes = Math.round(seconds / 60)
  const h = Math.floor(minutes / 60)
  return h > 0 ? `${h}h ${minutes % 60}m` : `${minutes}m`
}
const formatGrams = (g) => `${g.toFixed(1)} g`

// A colour coming from a file is only used if it really is a hex colour.
const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : 'var(--tenue)')

/* Same filament on several plates (type + colour) becomes one chip. */
function mergeFilaments(list) {
  const merged = []
  for (const f of list) {
    const same = merged.find(m => m.type === f.type && m.color === f.color)
    if (same) same.grams += f.grams
    else merged.push({ ...f })
  }
  return merged
}

/* ==================================================================
   IMPORT PANEL
   onApply(values, isNewFile): puts hours / partGrams / purgeGrams
   into the form. onUndo(): puts back what was there before.
================================================================== */
export default function ImportFile({ onApply, onUndo }) {
  const inputRef = useRef(null)
  const [status, setStatus] = useState('idle') // idle | reading | done | error
  const [error, setError] = useState('')
  const [result, setResult] = useState(null) // { fileName, slicer, plates }
  const [plate, setPlate] = useState('all') // a plate number, or 'all'
  const [partsText, setPartsText] = useState('1')
  const [dragging, setDragging] = useState(false)

  const partsCount = (text) => Math.max(1, Math.floor(Number(text)) || 1)

  const handleFile = async (file) => {
    if (!file) return
    setStatus('reading')
    setError('')
    try {
      const res = await readSlicedFile(file)
      const firstPlate = res.plates.length > 1 ? res.plates[0].index : 'all'
      setResult(res)
      setPlate(firstPlate)
      setPartsText('1')
      setStatus('done')
      onApply(formValuesFromPlates(res.plates, firstPlate, 1), true)
    } catch (err) {
      // Our own errors already have a message for the person; anything
      // else is a bug, so it also goes to the console.
      if (!(err instanceof ImportError)) console.error(err)
      setResult(null)
      setStatus('error')
      setError(err instanceof ImportError
        ? err.message
        : "Couldn't read this file. Try exporting it again from your slicer.")
    }
  }

  /* Dropping a file anywhere on the page works too, instead of the
     browser opening the G-code as a page full of text. The listeners
     are added once, so they reach the newest handleFile through a ref. */
  const handleRef = useRef(handleFile)
  useEffect(() => { handleRef.current = handleFile })

  useEffect(() => {
    const hasFiles = (e) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const onDragOver = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      setDragging(true)
    }
    const onDragLeave = (e) => {
      if (e.relatedTarget === null) setDragging(false) // left the window
    }
    const onDrop = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      setDragging(false)
      handleRef.current(e.dataTransfer.files[0])
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  const choosePlate = (value) => {
    const choice = value === 'all' ? 'all' : Number(value)
    setPlate(choice)
    onApply(formValuesFromPlates(result.plates, choice, partsCount(partsText)), false)
  }
  const changeParts = (text) => {
    setPartsText(text)
    onApply(formValuesFromPlates(result.plates, plate, partsCount(text)), false)
  }
  const undo = () => {
    onUndo()
    setResult(null)
    setStatus('idle')
  }

  /* What the summary shows, for the plate (or plates) chosen. */
  const chosen = !result ? [] : plate === 'all' ? result.plates : result.plates.filter(p => p.index === plate)
  const add = (key) => chosen.reduce((total, p) => total + (p[key] ?? 0), 0)
  const seconds = chosen.length && chosen.every(p => p.seconds != null) ? add('seconds') : null
  const totalGrams = chosen.length && chosen.every(p => p.totalGrams != null) ? add('totalGrams') : null
  const purgeKnown = chosen.some(p => p.purgeGrams != null)
  const filaments = mergeFilaments(chosen.flatMap(p => p.filaments))
  const filled = result ? formValuesFromPlates(result.plates, plate, partsCount(partsText)) : {}

  const filledText = [
    filled.hours != null && `print time ${filled.hours} h`,
    filled.partGrams != null && `part weight ${filled.partGrams} g`,
    filled.purgeGrams != null && `purge ${filled.purgeGrams} g`,
  ].filter(Boolean).join(' · ')

  const notes = []
  if (result) {
    if (seconds == null) notes.push('This file has no print time. Type it in by hand.')
    if (totalGrams == null) notes.push('This file has no filament weight. Type it in by hand.')
    if (chosen.some(p => p.estimated)) notes.push('Grams estimated from filament length, assuming 1.75 mm PLA.')
    if (totalGrams != null && !purgeKnown) notes.push("This file doesn't list purge on its own, so it's counted in the part weight.")
    if (filaments.length > 1) notes.push('For now, every filament is priced at the spool price below.')
  }

  return (
    <section className="panel import" aria-labelledby="import-title">
      <h2 id="import-title">Import from your slicer</h2>
      <div className="body">
        <div className={`dropzone${dragging ? ' over' : ''}`}>
          <p className="drop-title">
            {dragging ? 'Drop it to fill in the form' : 'Drop your sliced file anywhere on this page'}
          </p>
          <p className="drop-hint">
            .gcode, .bgcode or .gcode.3mf from Bambu Studio, OrcaSlicer, PrusaSlicer or Cura.
            Time and grams fill in by themselves. The file never leaves your browser.
          </p>
          <button type="button" className="controls" onClick={() => inputRef.current?.click()}>
            Choose file
          </button>
          {/* The real file picker is hidden; the button above opens it.
              Resetting value lets you pick the same file twice. */}
          <input
            ref={inputRef}
            type="file"
            hidden
            onChange={e => { handleFile(e.target.files[0]); e.target.value = '' }}
          />
        </div>

        <p className="import-status" role="status">{status === 'reading' ? 'Reading file…' : ''}</p>
        {status === 'error' && <p className="import-error" role="alert">{error}</p>}

        {status === 'done' && result && (
          <div className="import-result">
            <p className="import-file">
              <strong>{result.fileName}</strong>
              {result.slicer && <span className="muted"> · {result.slicer}</span>}
            </p>

            {result.plates.length > 1 && (
              <div className="field">
                <div className="row">
                  <div className="label-group"><label htmlFor="import-plate">Plate</label></div>
                  <select
                    id="import-plate"
                    className="import-select"
                    value={plate}
                    onChange={e => choosePlate(e.target.value)}
                  >
                    {result.plates.map(p => (
                      <option key={p.index} value={p.index}>Plate {p.index}</option>
                    ))}
                    <option value="all">All plates</option>
                  </select>
                </div>
              </div>
            )}

            <dl className="import-facts">
              <div><dt>Print time</dt><dd>{seconds != null ? formatDuration(seconds) : '—'}</dd></div>
              <div><dt>Filament</dt><dd>{totalGrams != null ? formatGrams(totalGrams) : '—'}</dd></div>
              {purgeKnown && <div><dt>Purge</dt><dd>{formatGrams(add('purgeGrams'))}</dd></div>}
            </dl>

            {filaments.length > 0 && (
              <ul className="import-filaments" aria-label="Filaments in this file">
                {filaments.map((f, i) => (
                  <li key={i}>
                    <i className="swatch" style={{ backgroundColor: safeColor(f.color) }} />
                    {f.type || 'Filament'} {formatGrams(f.grams)}
                  </li>
                ))}
              </ul>
            )}

            <div className="field">
              <div className="row">
                <div className="label-group"><label htmlFor="import-parts">Parts on this plate</label></div>
                <input
                  id="import-parts"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  value={partsText}
                  onChange={e => changeParts(e.target.value)}
                />
                <span className="unit">pcs</span>
              </div>
            </div>

            {filledText && (
              <p className="import-filled">
                Filled in for one part: {filledText} ·{' '}
                <button type="button" className="link" onClick={undo}>Undo</button>
              </p>
            )}
            {notes.map(note => <p className="import-note" key={note}>{note}</p>)}
          </div>
        )}
      </div>
    </section>
  )
}
