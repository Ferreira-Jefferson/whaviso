import { defineConfig } from 'vitest/config'

// Esqueleto minimo (F2). O scaffold completo do app e do modulo AT-motor-min.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    pool: 'forks',
    passWithNoTests: true,
  },
})
