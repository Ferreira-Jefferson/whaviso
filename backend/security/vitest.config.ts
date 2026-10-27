import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// A suite de seguranca conecta SEMPRE ao Postgres LOCAL (whaviso_dev), NUNCA ao Supabase
// cloud (ver helpers/conexao.ts, que aborta se o host parecer do Supabase). Carrega
// ../.env.test com precedencia sobre ../.env: o runtime de dev pode apontar para o cloud
// sem contaminar os testes.
for (const arquivo of ['../.env.test', '../.env']) {
  try {
    for (const linha of readFileSync(resolve(__dirname, arquivo), 'utf8').split('\n')) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(linha)
      if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '')
    }
  } catch {
    // arquivo ausente: tenta o proximo (sem nenhum, os testes de banco se pulam pela conexao)
  }
}

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Forks em serie: SET ROLE e pg_dump nao podem disputar o banco de teste.
    pool: 'forks',
    fileParallelism: false,
    passWithNoTests: false,
    // Cada teste de seguranca carrega o id SEC-### no titulo; o reporter padrao ja os lista.
    reporters: ['default'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
