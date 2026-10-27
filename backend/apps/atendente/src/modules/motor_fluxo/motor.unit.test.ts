// Testes de unidade (puros, sem banco) do motor: calculo de preco (heranca + add-on dependente de
// tamanho + maximo), disponibilidade (esgotado_ate expirado volta a vender; categoria fora do
// horario nao aparece), SEC-061 (texto livre nao confirma) e validacao do registry.
import { describe, expect, it } from 'vitest'
import { ErroMontagem, montarLinha } from './cardapio'
import { montarCardapio } from './montar_cardapio'
import { criarRegistry } from './registry'
import { confirmarNode } from './nodes/confirmar'
import { EFEITO } from './acoes'
import type { CardapioRaw } from './repo_leitura'
import type { EntradaTurno, EstadoFluxo, GrupoCtx, ItemCtx } from './tipos'

const ONTEM = new Date('2026-01-01T00:00:00Z')
const HOJE = new Date('2026-06-15T15:00:00Z') // domingo 12:00 em Sao_Paulo

const BURGER: ItemCtx = { id: 'i1', categoria_id: 'c1', nome: 'Burger', preco_centavos: 2000 }
const grupos = (): GrupoCtx[] => [
  {
    id: 'g1', nome: 'Tamanho', obrigatorio: true, min_escolhas: 1, max_escolhas: 1, aplica_a_opcao_id: null, ordem: 0,
    opcoes: [
      { id: 'op_peq', grupo_id: 'g1', nome: 'Pequena', preco_centavos: 0 },
      { id: 'op_gra', grupo_id: 'g1', nome: 'Grande', preco_centavos: 500 },
    ],
  },
  {
    id: 'g2', nome: 'Adicionais', obrigatorio: false, min_escolhas: 0, max_escolhas: 2, aplica_a_opcao_id: 'op_gra', ordem: 1,
    opcoes: [{ id: 'op_bacon', grupo_id: 'g2', nome: 'Bacon', preco_centavos: 300 }],
  },
]

describe('montarLinha (preco e snapshot)', () => {
  it('soma item + tamanho + adicional dependente do tamanho', () => {
    const l = montarLinha(BURGER, grupos(), { item_id: 'i1', quantidade: 2, opcoes_ids: ['op_gra', 'op_bacon'] })
    expect(l.preco_unitario_centavos).toBe(2000)
    expect(l.total_centavos).toBe((2000 + 500 + 300) * 2)
    expect(l.opcoes.map((o) => o.nome_snapshot).sort()).toEqual(['Bacon', 'Grande'])
  })

  it('recusa adicional preso a um tamanho nao escolhido', () => {
    expect(() => montarLinha(BURGER, grupos(), { item_id: 'i1', quantidade: 1, opcoes_ids: ['op_peq', 'op_bacon'] }))
      .toThrow(ErroMontagem)
  })

  it('exige o grupo obrigatorio (tamanho)', () => {
    expect(() => montarLinha(BURGER, grupos(), { item_id: 'i1', quantidade: 1, opcoes_ids: [] })).toThrow(ErroMontagem)
  })

  it('recusa acima do maximo do grupo (Tamanho aceita 1)', () => {
    expect(() => montarLinha(BURGER, grupos(), { item_id: 'i1', quantidade: 1, opcoes_ids: ['op_peq', 'op_gra'] }))
      .toThrow(ErroMontagem)
  })
})

function rawBase(): CardapioRaw {
  return {
    categorias: [{ id: 'c1', nome: 'Lanches', ativo: true, programacao: null, ordem: 0 }],
    itens: [{ id: 'i1', categoria_id: 'c1', nome: 'Burger', preco_centavos: 2000, ativo: true, esgotado_ate: null, ordem: 0 }],
    grupos: [],
    opcoes: [],
    vinculosCategoria: [],
    vinculosItem: [],
  }
}

describe('montarCardapio (disponibilidade e programacao)', () => {
  it('esgotado_ate expirado volta a vender', () => {
    const raw = rawBase()
    raw.itens[0]!.esgotado_ate = ONTEM // ja passou
    const c = montarCardapio(raw, HOJE)
    expect(c.itensPorId.has('i1')).toBe(true)
  })

  it('esgotado_ate no futuro some do cardapio', () => {
    const raw = rawBase()
    raw.itens[0]!.esgotado_ate = new Date('2026-12-31T00:00:00Z')
    const c = montarCardapio(raw, HOJE)
    expect(c.itensPorId.has('i1')).toBe(false)
  })

  it('categoria fora do horario programado nao aparece', () => {
    const raw = rawBase()
    // Janela de madrugada (00:00-01:00) todos os dias; HOJE e 12:00 em Sao_Paulo: fora da janela.
    raw.categorias[0]!.programacao = { janelas: [{ dias: [0, 1, 2, 3, 4, 5, 6], inicio: '00:00', fim: '01:00' }] }
    const c = montarCardapio(raw, HOJE)
    expect(c.categorias).toHaveLength(0)
  })
})

function entrada(evento: EntradaTurno['evento'], estado: Partial<EstadoFluxo>): EntradaTurno {
  return {
    evento,
    estado: {
      etapa: 'confirmar', carrinho: [{ item_id: 'i1', quantidade: 1, opcoes_ids: [] }], apresentados: [],
      categoria_id: null, item_id: null, grupos_pendentes: [], opcoes_grupo: [], opcoes_ids: [], endereco_id: null,
      aguardando: null, bairro_rascunho: null, pagamento: null, pedido_id: null, codigo: null, falhas: 0, ...estado,
    },
    loja: { id: 'l1', nome: 'Loja', horarios: null },
    cliente: { id: 'cli', nome: null, telefone_hash: 'x'.repeat(64) },
    cardapio: { categorias: [], itensPorCategoria: new Map(), itensPorId: new Map(), gruposPorItem: new Map() },
    ultimoEnderecoId: 'end1',
    ultimoEnderecoBairro: 'Centro',
    zonasBairros: ['Centro'],
    pedidoStatus: null,
    agora: HOJE,
  }
}

describe('confirmar (SEC-061: texto livre nao confirma)', () => {
  it('texto "confirmar pedido" fora do botao nao gera criar_pedido', async () => {
    const saida = await confirmarNode.executar(
      entrada({ tipo: 'texto', texto: 'confirmar pedido', botaoId: null }, {}),
      {},
      { loja_id: 'l1', conversa_id: 'conv1' },
    )
    expect(saida.efeitos.some((e) => e.tipo === EFEITO.criarPedido)).toBe(false)
    expect(saida.proximo).toBe('confirmar') // reapresenta, nao avanca
  })

  it('botao confirmar no estado certo avanca para endereco', async () => {
    const saida = await confirmarNode.executar(
      entrada({ tipo: 'botao', texto: null, botaoId: 'conf:ok' }, {}),
      {},
      { loja_id: 'l1', conversa_id: 'conv1' },
    )
    expect(saida.proximo).toBe('endereco')
  })
})

describe('criarRegistry', () => {
  it('monta o registry com todos os nodes do grafo e nenhum usa LLM', () => {
    const r = criarRegistry()
    expect(r.size).toBe(7)
    for (const node of r.values()) expect(node.usaLlm).toBe(false)
  })
})
