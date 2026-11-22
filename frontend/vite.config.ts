import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Unified build pipeline: Vite + React (no Next.js).
// All source lives under src/. The app/ and hooks/ root-level
// directories (Next.js App Router artefacts) have been removed.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@tokens':     resolve(__dirname, 'src/tokens.json'),
      '@components': resolve(__dirname, 'src/components'),
      '@hooks':      resolve(__dirname, 'src/hooks'),
    },
  },
})
