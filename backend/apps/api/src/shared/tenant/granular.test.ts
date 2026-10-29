// Prova de NAO-REGRESSAO da granularidade (item 14, eixo B), sem banco: cada chave nova passa para
// um papel que JA existia (dono/gerente/atendente) se e somente se ele passava no guard antigo do
// modulo. As tabelas abaixo sao a copia congelada do guard antigo de cada rota. `convidado` (papel
// novo) so ganha `:ver`, nunca `:gerir`/`:operar`/`:configurar`.
import { afterEach, describe, expect, it } from 'vitest'
import { CATALOGO } from './catalogo'
import { papelPermite } from './papeis'
import { resetarGrade } from './grade'

afterEach(() => resetarGrade())

type Antigo = 'qualquer_membro' | 'loja:gerir' | 'pedidos:gerir' | 'conversas:atender' | 'dono'

// O que cada papel existente passava em cada guard antigo.
const PASSAVA: Record<'dono' | 'gerente' | 'atendente', readonly Antigo[]> = {
  dono: ['qualquer_membro', 'loja:gerir', 'pedidos:gerir', 'conversas:atender', 'dono'],
  gerente: ['qualquer_membro', 'loja:gerir', 'pedidos:gerir', 'conversas:atender'],
  atendente: ['qualquer_membro', 'pedidos:gerir', 'conversas:atender'],
}

// chave nova -> guard antigo da(s) rota(s) que ela passou a proteger.
const NOVA_DE_ANTIGO: Record<string, Antigo> = {
  // cardapio (+ ficha tecnica + importacao)
  'cardapio:ver': 'qualquer_membro',
  'cardapio:gerir': 'loja:gerir',
  'cardapio:disponibilidade': 'pedidos:gerir',
  // fluxo
  'fluxo:ver': 'pedidos:gerir',
  'fluxo:gerir': 'loja:gerir',
  // conhecimento
  'conhecimento:ver': 'loja:gerir',
  'conhecimento:gerir': 'loja:gerir',
  // configuracoes_llm
  'ia:ver': 'loja:gerir',
  'ia:configurar': 'dono',
  // canais
  'canais:ver': 'loja:gerir',
  'canais:gerir': 'loja:gerir',
  'canais:configurar': 'dono',
  // conversas
  'conversas:ver': 'conversas:atender',
  // salao
  'salao:ver': 'pedidos:gerir',
  'salao:operar': 'pedidos:gerir',
  'salao:gerir': 'loja:gerir',
  // caixa
  'caixa:ver': 'pedidos:gerir',
  'caixa:gerir': 'pedidos:gerir',
  // estoque
  'estoque_insumos:ver': 'loja:gerir',
  'estoque_insumos:gerir': 'loja:gerir',
  'estoque_itens:ver': 'pedidos:gerir',
  'estoque_itens:gerir': 'loja:gerir',
  // demais modulos que usavam o guard grosso
  'campanhas:ver': 'loja:gerir',
  'campanhas:gerir': 'loja:gerir',
  'fidelidade:ver': 'pedidos:gerir',
  'fidelidade:operar': 'pedidos:gerir',
  'fidelidade:gerir': 'loja:gerir',
  'disponibilidade:ver': 'qualquer_membro',
  'disponibilidade:gerir': 'loja:gerir',
  'zonas_entrega:ver': 'qualquer_membro',
  'zonas_entrega:gerir': 'loja:gerir',
  'numeros_whatsapp:ver': 'loja:gerir',
  'numeros_whatsapp:gerir': 'loja:gerir',
  'pagamentos:ver': 'loja:gerir',
  'pagamentos:gerir': 'loja:gerir',
  'roteirizacao:ver': 'pedidos:gerir',
  'roteirizacao:operar': 'pedidos:gerir',
  'roteirizacao:gerir': 'loja:gerir',
}

describe('granularidade: padroes reproduzem o guard antigo', () => {
  it('o mapa cobre todas as chaves granulares do catalogo (nenhuma sem prova)', () => {
    const antigas = new Set([
      'conta:gerir', 'loja:gerir', 'lojas:gerir', 'pedidos:ver', 'pedidos:gerir', 'conversas:atender', 'relatorios:ver',
      'clientes:ver', 'clientes:gerir', 'dados_sensiveis:revelar', 'pessoas:ver', 'pessoas:gerir', 'fiscal:ver',
      'fiscal:gerir', 'fiscal:configurar', 'custos:ver', 'contas_pagar:ver', 'contas_pagar:gerir', 'promocoes:ver',
      'promocoes:gerir',
    ])
    const novas = CATALOGO.filter((d) => d.escopo === 'loja' && !antigas.has(d.chave)).map((d) => d.chave as string)
    expect(novas.sort()).toEqual(Object.keys(NOVA_DE_ANTIGO).sort())
  })

  for (const papel of ['dono', 'gerente', 'atendente'] as const) {
    it(`${papel}: cada chave nova passa se e somente se o guard antigo passava`, () => {
      for (const [nova, antigo] of Object.entries(NOVA_DE_ANTIGO)) {
        expect(papelPermite(papel, nova as never), `${papel} ${nova}`).toBe(PASSAVA[papel].includes(antigo))
      }
    })
  }

  it('convidado ganha so `:ver` (cardapio, estoque, disponibilidade, zonas) e nunca gerir/operar/configurar', () => {
    const convidado = Object.keys(NOVA_DE_ANTIGO).filter((c) => papelPermite('convidado', c as never)).sort()
    expect(convidado).toEqual([
      'cardapio:ver', 'disponibilidade:ver', 'estoque_insumos:ver', 'estoque_itens:ver', 'zonas_entrega:ver',
    ])
    for (const c of convidado) expect(c).toMatch(/:ver$/)
    for (const c of Object.keys(NOVA_DE_ANTIGO)) {
      if (/:(gerir|operar|configurar|disponibilidade)$/.test(c)) expect(papelPermite('convidado', c as never), c).toBe(false)
    }
  })

  it('dono tem todas as chaves novas (anti-lockout)', () => {
    for (const c of Object.keys(NOVA_DE_ANTIGO)) expect(papelPermite('dono', c as never), c).toBe(true)
  })
})
