import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Testes de integracao rodam num Postgres LOCAL (PGDATABASE; default whaviso_dev). Carrega
// .env.test (se houver) com precedencia sobre o ./.env raiz: assim o runtime de dev pode apontar
// para o Supabase cloud sem afetar os testes. Traz POSTGRES_PASSWORD para o pool superusuario.
for (const arquivo of ['../../.env.test', '../../.env']) {
  try {
    for (const linha of readFileSync(resolve(__dirname, arquivo), 'utf8').split('\n')) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(linha)
      if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '')
    }
  } catch {
    // arquivo ausente: tenta o proximo (sem nenhum, testes de banco se pulam pela conexao)
  }
}

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    pool: 'forks',
    fileParallelism: false,
    passWithNoTests: true,
  },
})
