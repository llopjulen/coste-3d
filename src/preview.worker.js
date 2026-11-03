/* ==================================================================
   PREVIEW WORKER — reads the dropped file for the 3D preview in a
   separate thread.

   Why a Web Worker: a 30 MB G-code takes about a second to read (measured:
   1.2 s for 900 000 segments). On the page's own thread that second
   freezes everything: scrolling, typing, the price. In a worker the page
   stays responsive and only the preview waits. The worker gets the File
   itself (it can read it on its own) and sends back typed arrays as
   "transferables": their memory MOVES to the page instead of being copied.

   Message in:  { file: File, plate: number | null }
   Message out: { ok: true, kind: 'toolpath', ...parseToolpath result }
              | { ok: true, kind: 'mesh', ...parseStl result }
              | { ok: false, code: 'bgcode' | 'empty' | 'read' }
================================================================== */
import { parseStl, parseToolpath } from './toolpath.js'

self.onmessage = async ({ data: { file, plate } }) => {
  try {
    const name = file.name.toLowerCase()
    if (name.endsWith('.bgcode')) return self.postMessage({ ok: false, code: 'bgcode' })

    if (name.endsWith('.stl')) {
      const mesh = parseStl(await file.arrayBuffer())
      if (!mesh || !mesh.triangles) return self.postMessage({ ok: false, code: 'empty' })
      return self.postMessage({ ok: true, kind: 'mesh', ...mesh }, [mesh.positions.buffer])
    }

    let text
    if (name.endsWith('.3mf')) {
      // The plate's G-code inside the sliced 3MF (Metadata/plate_N.gcode).
      const { unzipSync, strFromU8 } = await import('fflate')
      const zip = unzipSync(new Uint8Array(await file.arrayBuffer()), {
        filter: entry => /^Metadata\/plate_\d+\.gcode$/.test(entry.name),
      })
      const entries = Object.keys(zip).sort((a, b) => parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10))
      const wanted = entries.find(e => e === `Metadata/plate_${plate}.gcode`) ?? entries[0]
      if (!wanted) return self.postMessage({ ok: false, code: 'empty' })
      text = strFromU8(zip[wanted])
    } else {
      text = await file.text()
    }

    const path = parseToolpath(text)
    if (!path.segments) return self.postMessage({ ok: false, code: 'empty' })
    // positions is a view on a bigger buffer: copy it to its own buffer so
    // the transfer moves only what is used.
    const positions = path.positions.slice()
    self.postMessage({ ok: true, kind: 'toolpath', ...path, positions }, [positions.buffer, path.layerEnds.buffer, path.layerZ.buffer])
  } catch {
    self.postMessage({ ok: false, code: 'read' })
  }
}
