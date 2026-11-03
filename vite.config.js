import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    // The only chunk over Vite's 500 kB warning is the 3D viewer (three.js,
    // ~560 kB minified, ~140 kB compressed). It is already split out and
    // loaded only when someone presses "View in 3D", which is exactly what
    // the warning suggests, so the limit is raised to stop a false alarm.
    // A NEW warning above 600 kB would mean something else grew: look at it.
    chunkSizeWarningLimit: 600,
  },
})
