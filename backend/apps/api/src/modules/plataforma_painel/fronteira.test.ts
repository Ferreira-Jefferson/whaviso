// Guarda estatica (sem banco): o SQL do modulo nunca cita tabela de conteudo/uso de loja nem
// `select *`, e nao interpola valores em SQL. SEC-003 / SEC-080.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const PROIBIDAS = [
  'pedidos', 'itens_pedido', 'conversas', 'mensagens', 'clientes', 'enderecos', 'pagamentos',
  'loja_pix', 'credenciais_llm', 'uso_llm', 'base_conhecimento', 'cache_semantico', 'motoboys',
  'envios', 'numeros_whatsapp', 'membros',
]

function fontes(): { arquivo: string; texto: string }[] {
  return readdirSync(__dirname)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => ({ arquivo: f, texto: readFileSync(join(__dirname, f), 'utf8') }))
}

describe('plataforma_painel: guarda estatica', () => {
  it('nenhum arquivo cita tabela proibida em SQL', () => {
    for (const { arquivo, texto } of fontes()) {
      for (const t of PROIBIDAS) {
        const re = new RegExp(`(from|join|into|update)\\s+(public\\.)?${t}\\b`, 'i')
        expect(re.test(texto), `${arquivo} cita ${t}`).toBe(false)
      }
    }
  })

  it('sem select * e sem sqlBruto (nada de SQL por interpolacao)', () => {
    for (const { arquivo, texto } of fontes()) {
      expect(/select\s+\*/i.test(texto), `${arquivo} usa select *`).toBe(false)
      expect(/sqlBruto/.test(texto), `${arquivo} usa sqlBruto`).toBe(false)
    }
  })

  it('repo so le: nenhuma escrita', () => {
    const repo = fontes().find((f) => f.arquivo === 'repo.ts')!.texto
    expect(/\b(insert\s+into|update\s+public|delete\s+from)\b/i.test(repo)).toBe(false)
  })
})
