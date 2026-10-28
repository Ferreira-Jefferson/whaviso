import { configBackend } from '../test-support/vitest-backend'

// Config base compartilhada (ver backend/test-support). Seguranca roda em SERIE no banco base
// (comBanco: false): SET ROLE e pg_dump nao podem disputar nem paralelizar o banco de teste.
export default configBackend('security', {
  comBanco: false,
  include: ['test/**/*.test.ts'],
  passWithNoTests: false,
  testTimeout: 30_000,
  hookTimeout: 30_000,
})
