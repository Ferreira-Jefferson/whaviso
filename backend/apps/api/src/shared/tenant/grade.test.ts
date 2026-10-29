// Prova de NAO-REGRESSAO do motor de autorizacao editavel (item 14), sem banco: com os padroes
// semeados, os papeis que ja existiam tem EXATAMENTE o acesso de antes. As tabelas LEGADO abaixo
// sao a copia congelada do comportamento anterior (PERMISSOES_POR_PAPEL fixo + exigirAdmin +
// exigirPapel). Se alguem mudar um padrao, estes testes quebram.
import { afterEach, describe, expect, it } from 'vitest'
import { CATALOGO, PAPEL_FIXO, definicaoDe } from './catalogo'
import { operadorPermite, papelPermite } from './papeis'
import { permite, resetarGrade } from './grade'

afterEach(() => resetarGrade())

// --- Loja: o que cada papel existente podia (chave antiga) ---
const LEGADO_LOJA = {
  dono: ['loja:gerir', 'pedidos:gerir', 'conversas:atender', 'relatorios:ver'],
  gerente: ['loja:gerir', 'pedidos:gerir', 'conversas:atender', 'relatorios:ver'],
  atendente: ['pedidos:gerir', 'conversas:atender'],
} as const

// Cada chave nova nasce de um guard antigo. Quem passava no guard antigo precisa passar na chave nova.
//   guard antigo exigirPermissao('pedidos:gerir')  -> pedidos:ver, clientes:ver, clientes:gerir
//   guard antigo exigirPermissao('loja:gerir')     -> lojas:gerir (service: papel !== atendente), pessoas:*,
//                                                     fiscal:ver/gerir, custos:ver, contas_pagar:*, promocoes:*
//   guard antigo exigirPapel('dono','gerente')     -> dados_sensiveis:revelar, promocoes:*
//   guard antigo exigirPapel('dono')               -> fiscal:configurar
const NOVA_DE_ANTIGA: Record<string, string> = {
  'pedidos:ver': 'pedidos:gerir',
  'clientes:ver': 'pedidos:gerir',
  'clientes:gerir': 'pedidos:gerir',
  'lojas:gerir': 'loja:gerir',
  'pessoas:ver': 'loja:gerir',
  'pessoas:gerir': 'loja:gerir',
  'fiscal:ver': 'loja:gerir',
  'fiscal:gerir': 'loja:gerir',
  'custos:ver': 'loja:gerir',
  'contas_pagar:ver': 'loja:gerir',
  'contas_pagar:gerir': 'loja:gerir',
  'promocoes:ver': 'loja:gerir',
  'promocoes:gerir': 'loja:gerir',
  'dados_sensiveis:revelar': 'loja:gerir',
}

describe('loja: padroes reproduzem o comportamento anterior', () => {
  const chavesLoja = CATALOGO.filter((d) => d.escopo === 'loja').map((d) => d.chave)
  for (const papel of ['dono', 'gerente', 'atendente'] as const) {
    it(`${papel}: as 4 chaves antigas continuam exatamente iguais`, () => {
      for (const chave of ['loja:gerir', 'pedidos:gerir', 'conversas:atender', 'relatorios:ver'] as const) {
        expect(papelPermite(papel, chave), `${papel} ${chave}`).toBe((LEGADO_LOJA[papel] as readonly string[]).includes(chave))
      }
    })
    it(`${papel}: cada chave nova passa se e somente se o guard antigo passava`, () => {
      const antigas = LEGADO_LOJA[papel] as readonly string[]
      for (const [nova, antiga] of Object.entries(NOVA_DE_ANTIGA)) {
        // 'dados_sensiveis:revelar', 'promocoes:*' e 'lojas:gerir' eram "dono ou gerente" == loja:gerir hoje.
        expect(papelPermite(papel, nova as never), `${papel} ${nova}`).toBe(antigas.includes(antiga))
      }
    })
  }
  it('dono sempre tem tudo (inclui fiscal:configurar, antes exigirPapel(dono))', () => {
    for (const chave of chavesLoja) expect(papelPermite('dono', chave), chave).toBe(true)
    expect(papelPermite('gerente', 'fiscal:configurar')).toBe(false)
    expect(papelPermite('atendente', 'fiscal:configurar')).toBe(false)
  })
  it('convidado (novo) so tem leitura', () => {
    const tem = chavesLoja.filter((c) => papelPermite('convidado', c))
    // Leitura apenas: as 3 chaves originais + os `:ver` dos modulos granulares (ver granular.test.ts).
    expect(tem.sort()).toEqual([
      'cardapio:ver', 'clientes:ver', 'disponibilidade:ver', 'estoque_insumos:ver', 'estoque_itens:ver',
      'pedidos:ver', 'relatorios:ver', 'zonas_entrega:ver',
    ])
    for (const c of tem) expect(c).toMatch(/:ver$/)
  })
})

describe('console: padroes reproduzem o comportamento anterior', () => {
  // Antes: exigirAdmin -> so admin. Rota 'plataforma' sem guard extra -> qualquer operador ativo.
  const SO_ADMIN_ANTES = ['clientes_plataforma:criar', 'equipe:gerir', 'chaves_api:gerir', 'planos:gerir', 'acessos:gerir']
  const OPERADOR_ANTES = [
    'clientes_plataforma:ver', 'cobranca:ver', 'cobranca:gerir', 'funil:ver', 'funil:gerir',
    'painel:ver', 'custos_plataforma:ver',
  ]
  it('operador: faz tudo que fazia (rotas plataforma sem guard) e nada do que era so admin', () => {
    for (const c of OPERADOR_ANTES) expect(operadorPermite('operador', c as never), c).toBe(true)
    for (const c of SO_ADMIN_ANTES) expect(operadorPermite('operador', c as never), c).toBe(false)
  })
  it('admin tem todas as permissoes do console', () => {
    for (const d of CATALOGO.filter((x) => x.escopo === 'console')) expect(operadorPermite('admin', d.chave), d.chave).toBe(true)
  })
  it('todas as chaves de console estao cobertas (operador ou so admin)', () => {
    const consolePerms = CATALOGO.filter((d) => d.escopo === 'console').map((d) => d.chave as string).sort()
    expect([...OPERADOR_ANTES, ...SO_ADMIN_ANTES].sort()).toEqual(consolePerms)
  })
  it('convidado (console) nao ve faturas/assinaturas, mas ve clientes e o painel (fonte da verdade item 14)', () => {
    // `ver fatura` = `-` para convidado na grade do console (docs/pendencias-pos-corte.md item 14):
    // o papel de menor privilegio NAO le cobranca de nenhum tenant.
    expect(operadorPermite('convidado', 'cobranca:ver')).toBe(false)
    expect(operadorPermite('convidado', 'cobranca:gerir')).toBe(false)
    // Mantidos por desenho: `vê clientes e relatórios` (nao regredir ao remover cobranca).
    expect(operadorPermite('convidado', 'clientes_plataforma:ver')).toBe(true)
    expect(operadorPermite('convidado', 'painel:ver')).toBe(true)
  })
  it('papeis novos nunca gerem equipe nem acessos', () => {
    for (const papel of ['convidado', 'suporte', 'financeiro'] as const) {
      expect(operadorPermite(papel, 'equipe:gerir')).toBe(false)
      expect(operadorPermite(papel, 'acessos:gerir')).toBe(false)
      expect(operadorPermite(papel, 'chaves_api:gerir')).toBe(false)
    }
  })
})

describe('travas', () => {
  it('anti-lockout: admin (console) e dono (loja) tem toda permissao do seu escopo, inclusive acessos:gerir', () => {
    expect(permite('console', 'admin', 'acessos:gerir')).toBe(true)
    for (const d of CATALOGO) expect(permite(d.escopo, PAPEL_FIXO[d.escopo]!, d.chave)).toBe(true)
  })
  it('acessos:gerir nao e de nenhum outro papel', () => {
    for (const p of ['convidado', 'suporte', 'financeiro', 'operador']) expect(permite('console', p, 'acessos:gerir')).toBe(false)
  })
  it('chave desconhecida ou de outro escopo: nega (ate para o papel fixo)', () => {
    expect(permite('console', 'admin', 'nao:existe')).toBe(false)
    expect(permite('loja', 'dono', 'acessos:gerir')).toBe(false)
    expect(permite('console', 'admin', 'pedidos:gerir')).toBe(false)
  })
  it('definicaoDe resolve o escopo da chave', () => {
    expect(definicaoDe('acessos:gerir')?.escopo).toBe('console')
    expect(definicaoDe('pedidos:gerir')?.escopo).toBe('loja')
  })
})
