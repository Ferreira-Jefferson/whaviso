import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Testes de integração rodam SEMPRE no Postgres LOCAL (whaviso_dev). Carrega
// .env.test (config de teste) com precedência sobre o ./.env raiz: assim o
// runtime de dev pode apontar para o Supabase cloud sem afetar os testes.
for (const arquivo of ['../../.env.test', '../../.env']) {
  try {
    for (const linha of readFileSync(resolve(__dirname, arquivo), 'utf8').split('\n')) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(linha)
      if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '')
    }
  } catch {
    // arquivo ausente: tenta o próximo (sem nenhum, testes de DB são pulados pela conexão)
  }
}

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    pool: 'forks',
    fileParallelism: false,
    // Limpa a trava de idempotência do webhook (webhook_eventos_processados) antes de cada
    // teste: os testes reusam wamids fixos entre casos/arquivos, e sem o reset a dedup por
    // wamid faria um caso posterior ser ignorado. Ver test/setup.ts.
    setupFiles: ['./test/setup.ts'],
  },
})
