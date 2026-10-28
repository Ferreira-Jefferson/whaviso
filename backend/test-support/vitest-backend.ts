// Config base unica dos testes do backend. Cada workspace apenas chama configBackend(),
// para nenhum rodar de um jeito proprio. Centraliza: carga de .env.test/.env, pool de
// processos, paralelismo entre arquivos com banco por worker, e os setupFiles de banco.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type UserConfig } from 'vitest/config'
import { NUM_WORKERS as N } from './banco'

const RAIZ_BACKEND = resolve(__dirname, '..')

// Testes de integracao rodam SEMPRE no Postgres LOCAL. Carrega .env.test (config de teste)
// com precedencia sobre o .env raiz: o runtime de dev pode apontar para o cloud sem afetar os testes.
function carregarEnv(): void {
  for (const arquivo of ['.env.test', '.env']) {
    try {
      for (const linha of readFileSync(resolve(RAIZ_BACKEND, arquivo), 'utf8').split('\n')) {
        const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(linha)
        if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '')
      }
    } catch {
      // arquivo ausente: tenta o proximo (sem nenhum, testes de DB sao pulados pela conexao)
    }
  }
}

export interface OpcoesConfigBackend {
  /** Liga banco por worker + paralelismo entre arquivos. Desligue em suites que precisam
   *  do banco base em serie (ex.: seguranca com pg_dump/SET ROLE). Default: true. */
  comBanco?: boolean
  /** Padroes de arquivos de teste. Default: src/**+test/** .test.ts */
  include?: string[]
  /** setupFiles proprios do workspace, somados aos de banco. */
  setupFiles?: string[]
  passWithNoTests?: boolean
  testTimeout?: number
  hookTimeout?: number
}

export function configBackend(escopo: string, opcoes: OpcoesConfigBackend = {}): UserConfig {
  carregarEnv()
  // Isola os bancos por worker deste workspace dos demais (ver test-support/banco.ts).
  // Definido no processo principal; os workers (forks) herdam.
  process.env.TEST_DB_SCOPE = escopo
  const comBanco = opcoes.comBanco ?? true
  return defineConfig({
    test: {
      include: opcoes.include ?? ['src/**/*.test.ts', 'test/**/*.test.ts'],
      pool: 'forks',
      // Paralelismo entre arquivos so e seguro com um banco por worker (ver test-support/banco.ts).
      fileParallelism: comBanco,
      poolOptions: { forks: { maxForks: N, minForks: 1 } },
      globalSetup: comBanco ? [resolve(__dirname, 'global-setup.ts')] : [],
      setupFiles: [
        ...(comBanco ? [resolve(__dirname, 'setup-banco.ts')] : []),
        ...(opcoes.setupFiles ?? []),
      ],
      passWithNoTests: opcoes.passWithNoTests ?? true,
      testTimeout: opcoes.testTimeout,
      hookTimeout: opcoes.hookTimeout,
    },
  }) as UserConfig
}
