// SEC-010 (lado cliente): o front nunca consulta o banco. supabase-js so serve para obter o JWT.
// SEC-025 (fonte): nenhuma referencia a service_role no codigo do front.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = join(__dirname, '..')

function arquivos(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) arquivos(p, acc)
    else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.(ts|tsx)$/.test(nome)) acc.push(p)
  }
  return acc
}

// Comentarios mencionam a regra de proposito ("nunca supabase.from"); so o codigo conta.
const semComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')
const FONTES = arquivos(RAIZ).map((p) => ({ p, s: semComentarios(readFileSync(p, 'utf8')) }))

describe('seguranca do cliente', () => {
  it('SEC-010: nenhum supabase.from(...) / .rpc(...) / functions.invoke / storage', () => {
    const ruins = FONTES.filter(({ s }) =>
      /supabase\s*\.\s*(from|rpc|schema|storage|functions)\b|\.functions\s*\.\s*invoke/.test(s),
    ).map(({ p }) => p)
    expect(ruins).toEqual([])
  })

  it('SEC-025: sem service_role no codigo', () => {
    const ruins = FONTES.filter(({ s }) => /service_role|SERVICE_ROLE/.test(s)).map(({ p }) => p)
    expect(ruins).toEqual([])
  })

  it('o front nao importa @whaviso/shared', () => {
    const ruins = FONTES.filter(({ s }) => /from\s+['"]@whaviso\/shared/.test(s)).map(({ p }) => p)
    expect(ruins).toEqual([])
  })
})
