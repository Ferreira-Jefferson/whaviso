import { configBackend } from '../../test-support/vitest-backend'

// Config base compartilhada (ver backend/test-support). zap em serie por ora (comBanco: false):
// poucos arquivos e o reset de idempotencia do webhook roda por teste via setup.ts.
export default configBackend('zap', {
  comBanco: false,
  setupFiles: ['./test/setup.ts'],
})
