import { configBackend } from '../../test-support/vitest-backend'

// Config base compartilhada (ver backend/test-support). Banco por worker + paralelismo
// entre arquivos ligados por padrao.
export default configBackend('api')
