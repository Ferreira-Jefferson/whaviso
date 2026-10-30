// Guarda estatica (sem banco): o SQL do modulo so toca as tabelas de evals e `lojas`; nunca tabela
// de conteudo/uso de loja, nem `select *`, nem SQL por interpolacao. eval_resultados so e lida.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const PROIBIDAS = [
  'pedidos', 'itens_pedido', 'conversas', 'mensagens', 'clientes', 'enderecos', 'pagamentos',
  'loja_pix', 'credenciais_llm', 'uso_llm', 'base_conhecimento', 'base_avaliacao', 'cache_semantico',
  'motoboys', 'envios', 'numeros_whatsapp', 'membros', 'contas', 'assinaturas', 'faturas',
]

function fontes(): { arquivo: string; texto: string }[] {
  return readdirSync(__dirname)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => ({ arquivo: f, texto: readFileSync(join(__dirname, f), 'utf8') }))
}

describe('plataforma_evals: guarda estatica', () => {
  it('nenhum arquivo cita tabela proibida em SQL', () => {
    for (const { arquivo, texto } of fontes()) {
      for (const t of PROIBIDAS) {
        const re = new RegExp(`(from|join|into|update)\\s+(public\\.)?${t}\\b`, 'i')
        expect(re.test(texto), `${arquivo} cita ${t}`).toBe(false)
      }
    }
  })

  it('sem select * e sem sqlBruto fora do formatador de timestamp', () => {
    for (const { arquivo, texto } of fontes()) {
      expect(/select\s+\*/i.test(texto), `${arquivo} usa select *`).toBe(false)
    }
    const repo = fontes().find((f) => f.arquivo === 'repo.ts')!.texto
    expect(repo.match(/sqlBruto\(/g)).toHaveLength(1)
  })

  it('eval_resultados e lojas so sao lidas; nenhum delete em eval_execucoes', () => {
    const repo = fontes().find((f) => f.arquivo === 'repo.ts')!.texto
    expect(/(insert\s+into|update|delete\s+from)\s+public\.(eval_resultados|lojas)\b/i.test(repo)).toBe(false)
    expect(/delete\s+from\s+public\.eval_execucoes/i.test(repo)).toBe(false)
  })
})
