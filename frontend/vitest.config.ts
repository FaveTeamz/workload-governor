import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@tokens': resolve(__dirname, 'src/tokens.json') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
    include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.{ts,tsx}'],
    resolveSnapshotPath(testPath, snapshotExtension) {
      // Keep snapshot files co-located with tests but in a dedicated subdirectory.
      // tests/unit/foo.test.tsx  → tests/unit/snapshots/foo.test.tsx.snap
      // src/**/*.test.tsx        → src/__snapshots__/... (default behaviour)
      if (testPath.includes('tests/unit/')) {
        const fileName = testPath.replace(/^.*tests\/unit\//, '')
        return resolve(__dirname, 'tests/unit/snapshots', fileName + snapshotExtension)
      }
      // Default: place alongside the test file in __snapshots__/
      const dir = testPath.substring(0, testPath.lastIndexOf('/'))
      const base = testPath.substring(testPath.lastIndexOf('/') + 1)
      return resolve(dir, '__snapshots__', base + snapshotExtension)
    },
  },
})
