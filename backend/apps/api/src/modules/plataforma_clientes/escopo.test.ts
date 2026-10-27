// Guarda estatica (sem banco): o SQL do modulo nunca cita tabela de conteudo de loja nem
// `select *`, e o escape de LIKE trata a busca como literal. SEC-003 / SEC-080.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { escaparLike } from './repo'

const PROIBIDAS = [
  'pedidos', 'itens_pedido', 'conversas', 'mensagens', 'clientes', 'enderecos', 'pagamentos',
  'loja_pix', 'credenciais_llm', 'uso_llm', 'base_conhecimento', 'cache_semantico', 'motoboys',
  'envios',
]

function fontes(): { arquivo: string; texto: string }[] {
  return readdirSync(__dirname)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => ({ arquivo: f, texto: readFileSync(join(__dirname, f), 'utf8') }))
}

describe('plataforma_clientes: guarda estatica', () => {
  it('nenhum arquivo cita tabela de conteudo em SQL', () => {
    for (const { arquivo, texto } of fontes()) {
      for (const t of PROIBIDAS) {
        const re = new RegExp(`(from|join|into|update)\\s+(public\\.)?${t}\\b`, 'i')
        expect(re.test(texto), `${arquivo} cita ${t}`).toBe(false)
      }
    }
  })

  it('nenhum select * e nenhum token/hash de numero no SELECT', () => {
    for (const { arquivo, texto } of fontes()) {
      expect(/select\s+\*/i.test(texto), `${arquivo} usa select *`).toBe(false)
      expect(/token_cifrado|numero_hash|phone_number_id/.test(texto), `${arquivo} le coluna sensivel`).toBe(false)
    }
  })

  it('escaparLike neutraliza %, _ e barra', () => {
    expect(escaparLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d')
    expect(escaparLike("'; drop table x;--")).toBe("'; drop table x;--")
  })
})
