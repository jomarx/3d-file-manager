// Runs vitest inside Electron's Node runtime. better-sqlite3 is compiled for
// Electron's ABI, so database tests can't load it under the system Node.
import { spawnSync } from 'node:child_process'
import electron from 'electron'

const result = spawnSync(electron, ['node_modules/vitest/vitest.mjs', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
process.exit(result.status ?? 1)
