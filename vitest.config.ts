import { defineConfig } from 'vitest/config'

// Scope the suite to this plugin's own tests. Without an explicit include,
// vitest walks the whole tree and picks up the locally cloned marketplace
// repo (awesome-dsh-plugin/, gitignored) whose node:test scripts and missing
// js-yaml dependency are not ours to run — they failed the release gate.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/lib/**', 'awesome-dsh-plugin/**', '.pr/**'],
    // Several suites drive a real loopback HTTP shim and wait on stream
    // timing (stop-generation, the 262k-character boundary). Under the
    // default 5s they pass alone but time out when the whole suite runs in
    // parallel on one machine — the failures are wall-clock, not logic.
    testTimeout: 30_000,
  },
})
