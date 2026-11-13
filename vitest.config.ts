import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // testy bazy działają pod Electronem (natywny better-sqlite3) — osobny skrypt `test:db`
    exclude: ['tests/**/*.electron.test.ts', 'node_modules/**']
  }
})
