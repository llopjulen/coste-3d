import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { useI18n } from './i18n/context.js'
import { fmtGrams, fmtNumber } from './i18n/format.js'
import { readSlicedFile, formValuesFromPlates, mergeFilaments, ImportError } from './slicerFile.js'

/* 4443 seconds -> "1h 14m" */
function formatDuration(seconds) {
  const minutes = Math.round(seconds / 60)
  const h = Math.floor(minutes / 60)
  return h > 0 ? `${h}h ${minutes % 60}m` : `${minutes}m`
}

// The 3D viewer and three.js are downloaded only when someone opens it.
const PrintPreview = lazy(() => import('./PrintPreview.jsx'))

// Files the viewer can draw. A .bgcode is compressed in blocks (heatshrink,
// MeatPack) that the browser can't unpack without another library, so it
// gets the numbers but no preview.
const canPreview = file => !!file && /\.(gcode|gco|g|3mf|stl)$/i.test(file.name)

// A colour coming from a file is only used if it really is a hex colour.
const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(c) ? c : 'var(--tenue)')

/* ==================================================================
   IMPORT PANEL
   onApply(values, isNewFile): puts hours / partGrams / purgeGrams
   into the form. onUndo(): puts back what was there before.
================================================================== */
export default function ImportFile({ onApply, onUndo, onFile }) {
  const { t, locale } = useI18n()
  const formatGrams = g => fmtGrams(locale, g)
  const inputRef = useRef(null)
  const [status, setStatus] = useState('idle') // idle | reading | done | error
  const [error, setError] = useState('')
  const [result, setResult] = useState(null) // { fileName, slicer, plates }
  const [plate, setPlate] = useState('all') // a plate number, or 'all'
  const [partsText, setPartsText] = useState('1')
  const [dragging, setDragging] = useState(false)
  // The last file dropped, kept for the 3D preview, and whether it is open.
  const [file, setFile] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  // Tells App which file (and plate) is loaded, so the 3D cost object can
  // show that part. null when it is undone or could not be read.
  useEffect(() => {
    const drawable = file && (status === 'done' || (status === 'error' && /\.stl$/i.test(file.name)))
    onFile?.(drawable ? file : null, plate === 'all' ? null : plate)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onFile is a new function on every render of App
  }, [file, plate, status])

  const partsCount = (text) => Math.max(1, Math.floor(Number(text)) || 1)

  const handleFile = async (file) => {
    if (!file) return
    setStatus('reading')
    setError('')
    setFile(file)
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
      // The code picks the translated text; the English message is only the
      // fallback if a code has no translation yet (t returns the key itself then).
      const key = err instanceof ImportError && err.code ? `importError.${err.code}` : null
      const text = key ? t(key) : null
      setError(err instanceof ImportError
        ? (text && text !== key ? text : err.message)
        : t('import.err.read'))
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
    setFile(null)
    setPreviewOpen(false)
  }

  // An STL is refused for the numbers (it isn't sliced) but can still be looked at.
  const previewable = canPreview(file) && (status === 'done' || (status === 'error' && /\.stl$/i.test(file.name)))
  const previewButton = previewable && (
    <button type="button" className="controls preview-toggle" aria-expanded={previewOpen} onClick={() => setPreviewOpen(open => !open)}>
      {previewOpen ? t('preview.hide') : t('preview.show')}
    </button>
  )
  const previewBlock = previewable && previewOpen && (
    <Suspense fallback={<p className="preview-msg">{t('preview.loading')}</p>}>
      {/* The key makes a new file or plate start a fresh viewer (state back to "loading"). */}
      <PrintPreview key={`${file.name}:${file.size}:${file.lastModified}:${plate}`} file={file} plate={plate === 'all' ? null : plate} />
    </Suspense>
  )

  /* What the summary shows, for the plate (or plates) chosen. */
  const chosen = !result ? [] : plate === 'all' ? result.plates : result.plates.filter(p => p.index === plate)
  const add = (key) => chosen.reduce((total, p) => total + (p[key] ?? 0), 0)
  const seconds = chosen.length && chosen.every(p => p.seconds != null) ? add('seconds') : null
  const totalGrams = chosen.length && chosen.every(p => p.totalGrams != null) ? add('totalGrams') : null
  const purgeKnown = chosen.some(p => p.purgeGrams != null)
  const filaments = mergeFilaments(chosen.flatMap(p => p.filaments))
  const filled = result ? formValuesFromPlates(result.plates, plate, partsCount(partsText)) : {}

  const filledText = [
    filled.hours != null && t('import.f.hours', { value: fmtNumber(locale, filled.hours) }),
    filled.partGrams != null && t('import.f.part', { value: fmtNumber(locale, filled.partGrams) }),
    filled.purgeGrams != null && t('import.f.purge', { value: fmtNumber(locale, filled.purgeGrams) }),
  ].filter(Boolean).join(' · ')

  const notes = []
  if (result) {
    if (seconds == null) notes.push(t('import.note.noTime'))
    if (totalGrams == null) notes.push(t('import.note.noWeight'))
    if (chosen.some(p => p.estimated)) notes.push(t('import.note.estimated'))
    if (totalGrams != null && !purgeKnown) notes.push(t('import.note.purgeInPart'))
    if (filaments.length > 1) notes.push(t('import.note.manyFilaments'))
  }

  return (
    <section className="panel import" aria-labelledby="import-title">
      <h2 id="import-title">{t('import.title')}</h2>
      <div className="body">
        <div className={`dropzone${dragging ? ' over' : ''}`}>
          <p className="drop-title">
            {dragging ? t('import.dropActive') : t('import.drop')}
          </p>
          <p className="drop-hint">
            {t('import.hint')}
          </p>
          <button type="button" className="controls" onClick={() => inputRef.current?.click()}>
            {t('import.choose')}
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

        <p className="import-status" role="status">{status === 'reading' ? t('import.reading') : ''}</p>
        {status === 'error' && <p className="import-error" role="alert">{error}</p>}
        {status === 'error' && previewButton}
        {status === 'error' && previewBlock}

        {status === 'done' && result && (
          <div className="import-result">
            <div className="import-file-row">
              <p className="import-file">
                <strong>{result.fileName}</strong>
                {result.slicer && <span className="muted"> · {result.slicer}</span>}
              </p>
              {previewButton}
            </div>
            {previewBlock}

            {result.plates.length > 1 && (
              <div className="field">
                <div className="row">
                  <div className="label-group"><label htmlFor="import-plate">{t('import.plate')}</label></div>
                  <select
                    id="import-plate"
                    className="import-select"
                    value={plate}
                    onChange={e => choosePlate(e.target.value)}
                  >
                    {result.plates.map(p => (
                      <option key={p.index} value={p.index}>{t('import.plateN', { n: p.index })}</option>
                    ))}
                    <option value="all">{t('import.allPlates')}</option>
                  </select>
                </div>
              </div>
            )}

            <dl className="import-facts">
              <div><dt>{t('import.printTime')}</dt><dd>{seconds != null ? formatDuration(seconds) : '—'}</dd></div>
              <div><dt>{t('import.filament')}</dt><dd>{totalGrams != null ? formatGrams(totalGrams) : '—'}</dd></div>
              {purgeKnown && <div><dt>{t('import.purge')}</dt><dd>{formatGrams(add('purgeGrams'))}</dd></div>}
            </dl>

            {filaments.length > 0 && (
              <ul className="import-filaments" aria-label={t('import.filamentsIn')}>
                {filaments.map((f, i) => (
                  <li key={i}>
                    <i className="swatch" style={{ backgroundColor: safeColor(f.color) }} />
                    {f.type || t('import.filament')} {formatGrams(f.grams)}
                  </li>
                ))}
              </ul>
            )}

            <div className="field">
              <div className="row">
                <div className="label-group"><label htmlFor="import-parts">{t('import.partsOnPlate')}</label></div>
                <input
                  id="import-parts"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  step="1"
                  value={partsText}
                  onChange={e => changeParts(e.target.value)}
                />
                <span className="unit">{t('unit.pcs')}</span>
              </div>
            </div>

            {filledText && (
              <p className="import-filled">
                {t('import.filled', { list: filledText })}{' '}
                <button type="button" className="link" onClick={undo}>{t('import.undo')}</button>
              </p>
            )}
            {notes.map(note => <p className="import-note" key={note}>{note}</p>)}
          </div>
        )}
      </div>
    </section>
  )
}
