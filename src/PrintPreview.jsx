import { useEffect, useRef, useState } from 'react'
import {
  BufferAttribute, BufferGeometry, Color, DirectionalLight, GridHelper, HemisphereLight,
  LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene, Vector3, WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { useI18n } from './i18n/context.js'
import { fmtNumber } from './i18n/format.js'

/* ==================================================================
   PRINT PREVIEW — the part in 3D, from the file the person dropped.

   This whole file (and three.js with it, ~150 kB compressed) is loaded
   only when someone presses "View in 3D" (React.lazy in ImportFile.jsx):
   nobody pays for the viewer unless they open it.

   - G-code / sliced 3MF: the toolpath, layer by layer, as the printer will
     draw it. A slider scrubs through the layers, like a slicer's preview;
     the layer on top is gold, the ones below go from stone to light by
     height, so the shape reads without lights or shading.
   - STL: the model as a solid, lit from above.
   The file is read in a Web Worker (preview.worker.js) so the page doesn't
   freeze. The picture is drawn only when something changes (a drag, the
   slider, a resize), not 60 times a second: a still preview should not
   spend the battery.

   Coordinates: printers are Z-up (Z is the height), three.js is Y-up by
   default, so the camera's "up" is set to Z instead of rotating the part.
================================================================== */

// Colours come from the CSS tokens, so the preview follows the theme.
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

export default function PrintPreview({ file, plate }) {
  const { t, locale } = useI18n()
  const hostRef = useRef(null)
  const viewRef = useRef(null) // { setLayer(n), dispose() } once the scene exists
  const [state, setState] = useState({ status: 'loading' })
  const [layer, setLayer] = useState(0)

  // 1) Read the file in the worker. A new file or plate mounts a new
  //    PrintPreview (ImportFile gives it a `key`), so state starts as loading.
  useEffect(() => {
    const worker = new Worker(new URL('./preview.worker.js', import.meta.url), { type: 'module' })
    let alive = true
    worker.onmessage = ({ data }) => {
      if (!alive) return
      if (!data.ok) setState({ status: 'error', code: data.code })
      else {
        setState({ status: 'ready', data })
        if (data.kind === 'toolpath') setLayer(data.layerZ.length)
      }
      worker.terminate()
    }
    worker.onerror = () => { if (alive) setState({ status: 'error', code: 'read' }); worker.terminate() }
    worker.postMessage({ file, plate: typeof plate === 'number' ? plate : null })
    return () => { alive = false; worker.terminate() }
  }, [file, plate])

  // 2) Build the scene once the data is here.
  useEffect(() => {
    if (state.status !== 'ready') return undefined
    const view = buildScene(hostRef.current, state.data)
    viewRef.current = view
    return () => { view.dispose(); viewRef.current = null }
  }, [state])

  // 3) The slider only changes how much is drawn.
  useEffect(() => { viewRef.current?.setLayer(layer) }, [layer, state])

  const data = state.status === 'ready' ? state.data : null
  const layers = data?.kind === 'toolpath' ? data.layerZ.length : 0

  return (
    <div className="preview">
      <div
        ref={hostRef}
        className="preview-canvas"
        role="img"
        aria-label={t('preview.canvas', { name: file.name })}
      >
        {state.status === 'loading' && <p className="preview-msg">{t('preview.loading')}</p>}
        {state.status === 'error' && <p className="preview-msg" role="alert">{t(`preview.err.${state.code}`)}</p>}
      </div>

      {layers > 1 && (
        <div className="preview-layers">
          <label htmlFor="preview-layer">{t('preview.layerLabel')}</label>
          <input
            id="preview-layer"
            type="range"
            min="1"
            max={layers}
            value={layer}
            onChange={e => setLayer(Number(e.target.value))}
          />
          <span className="preview-layer-text">
            {t('preview.layer', { n: layer, total: layers, z: fmtNumber(locale, data.layerZ[layer - 1], 2) })}
          </span>
        </div>
      )}
      {data && (
        <p className="preview-hint">
          {t('preview.hint')}
          {data.kind === 'mesh' && <> {t('preview.triangles', { n: fmtNumber(locale, data.triangles, 0) })}</>}
          {data.truncated && <> {t('preview.truncated')}</>}
        </p>
      )}
    </div>
  )
}

/* Everything three.js, outside React: a scene, a camera that orbits the
   part, and the part itself. Returns setLayer and dispose. */
function buildScene(host, data) {
  const width = host.clientWidth
  const height = host.clientHeight
  const renderer = new WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height)
  host.appendChild(renderer.domElement)

  const scene = new Scene()
  const { min, max } = data.bounds
  const center = new Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)
  const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1)

  const camera = new PerspectiveCamera(35, width / height, size / 100, size * 50)
  camera.up.set(0, 0, 1)
  // Three-quarter view from the front, a little above: how you'd look at a part on the bed.
  camera.position.set(center.x + size * 1.1, center.y - size * 1.6, center.z + size * 1.1)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.copy(center)
  controls.update()

  // A quiet grid under the part: it says where the bed is and how big the part is.
  const step = gridStep(size)
  const span = Math.ceil((size * 1.6) / step) * step
  const grid = new GridHelper(span, span / step, new Color(cssVar('--borde-fuerte')), new Color(cssVar('--borde')))
  grid.rotation.x = Math.PI / 2
  grid.position.set(center.x, center.y, min[2])
  scene.add(grid)

  const disposables = [grid.geometry, grid.material]
  let setLayer = () => {}

  if (data.kind === 'mesh') {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(data.positions, 3))
    geometry.computeVertexNormals()
    const material = new MeshStandardMaterial({ color: new Color(cssVar('--tenue')), roughness: 0.75, metalness: 0, flatShading: true })
    scene.add(new Mesh(geometry, material))
    scene.add(new HemisphereLight(0xffffff, 0x404040, 1.6))
    const sun = new DirectionalLight(0xffffff, 1.6)
    sun.position.set(center.x + size, center.y - size, center.z + size * 2)
    scene.add(sun)
    disposables.push(geometry, material)
  } else {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(data.positions, 3))
    // Colour by height: stone at the bottom, the text colour at the top.
    const low = new Color(cssVar('--borde-fuerte'))
    const high = new Color(cssVar('--texto'))
    const colors = new Float32Array(data.positions.length)
    const zRange = Math.max(max[2] - min[2], 1e-6)
    const c = new Color()
    for (let i = 0; i < data.positions.length; i += 3) {
      c.copy(low).lerp(high, (data.positions[i + 2] - min[2]) / zRange)
      colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3))
    const below = new LineSegments(geometry, new LineBasicMaterial({ vertexColors: true }))
    // The current layer: the same points, drawn again in gold on top.
    const topGeometry = new BufferGeometry()
    topGeometry.setAttribute('position', geometry.getAttribute('position'))
    const top = new LineSegments(topGeometry, new LineBasicMaterial({ color: new Color(cssVar('--oro')) }))
    scene.add(below, top)
    disposables.push(geometry, topGeometry, below.material, top.material)

    setLayer = n => {
      const layers = data.layerEnds.length
      const k = Math.min(Math.max(n, 1), layers)
      const end = data.layerEnds[k - 1]
      const start = k > 1 ? data.layerEnds[k - 2] : 0
      // drawRange counts vertices: two per segment.
      geometry.setDrawRange(0, start * 2)
      topGeometry.setDrawRange(start * 2, (end - start) * 2)
      render()
    }
  }

  function render() { renderer.render(scene, camera) }
  controls.addEventListener('change', render)

  const resize = new ResizeObserver(() => {
    const w = host.clientWidth, h = host.clientHeight
    if (!w || !h) return
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    render()
  })
  resize.observe(host)
  render()

  return {
    setLayer,
    dispose() {
      resize.disconnect()
      controls.removeEventListener('change', render)
      controls.dispose()
      for (const d of disposables) d.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

/* A round grid spacing for a part of this size: 1, 2, 5, 10, 20, 50 mm… */
function gridStep(size) {
  const raw = size / 8
  const p = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 5, 10].map(m => m * p).find(s => s >= raw) ?? 10 * p
}
