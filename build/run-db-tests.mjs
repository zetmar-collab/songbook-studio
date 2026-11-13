// Buduje testy bazy (esbuild) i uruchamia je pod Electronem, bo natywny better-sqlite3
// jest zbudowany pod ABI Electrona, a nie zwykłego Node.
import { build } from 'esbuild'
import { spawnSync } from 'child_process'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const electron = require('electron') // ścieżka do electron.exe

await build({
  entryPoints: ['tests/db.electron.test.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: 'out-test/db.test.cjs',
  external: ['better-sqlite3'],
  logLevel: 'error'
})

const r = spawnSync(electron, ['out-test/db.test.cjs'], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})
process.exit(r.status ?? 1)
