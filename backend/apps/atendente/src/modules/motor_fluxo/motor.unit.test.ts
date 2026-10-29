// Testes de unidade (puros, sem banco) do motor: calculo de preco (heranca + add-on dependente de
// tamanho + maximo), disponibilidade (esgotado_ate expirado volta a vender; categoria fora do
// horario nao aparece), SEC-061 (texto livre nao confirma) e validacao do registry.
import { describe, expect, it } from 'vitest'
import type { ModoAtendente } from '@whaviso/shared/disponibilidade'
import { ErroMontagem, montarLinha } from './cardapio'
import { montarCardapio } from './montar_cardapio'
import { mensagemPedidoRecebido } from './efeitos'
import { criarRegistry, NODES_COM_LLM } from './registry'
import { elegivelParaHarness, validarRascunho } from './texto_livre'
import { acompanharNode } from './nodes/acompanhar'
import { confirmarNode } from './nodes/confirmar'
import { saudacaoNode } from './nodes/saudacao'
import { EFEITO } from './acoes'
import type { CardapioRaw } from './repo_leitura'
import type { CategoriaCtx, EntradaTurno, EstadoFluxo, GrupoCtx, ItemCtx } from './tipos'

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
    itens: [{ id: 'i1', categoria_id: 'c1', nome: 'Burger', preco_centavos: 2000, ativo: true, esgotado_ate: null, ordem: 0, controla_estoque: false, quantidade_disponivel: null }],
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

  it('item com contador zerado some do cardapio (historia 03)', () => {
    const raw = rawBase()
    raw.itens[0]!.controla_estoque = true
    raw.itens[0]!.quantidade_disponivel = 0
    const c = montarCardapio(raw, HOJE)
    expect(c.itensPorId.has('i1')).toBe(false)
  })

  it('item com contador e saldo > 0 continua no cardapio; ilimitado tambem', () => {
    const comSaldo = rawBase()
    comSaldo.itens[0]!.controla_estoque = true
    comSaldo.itens[0]!.quantidade_disponivel = 3
    expect(montarCardapio(comSaldo, HOJE).itensPorId.has('i1')).toBe(true)
    const ilimitado = rawBase()
    ilimitado.itens[0]!.controla_estoque = true
    ilimitado.itens[0]!.quantidade_disponivel = null
    expect(montarCardapio(ilimitado, HOJE).itensPorId.has('i1')).toBe(true)
  })

  it('categoria fora do horario programado nao aparece', () => {
    const raw = rawBase()
    // Janela de madrugada (00:00-01:00) todos os dias; HOJE e 12:00 em Sao_Paulo: fora da janela.
    raw.categorias[0]!.programacao = { janelas: [{ dias: [0, 1, 2, 3, 4, 5, 6], inicio: '00:00', fim: '01:00' }] }
    const c = montarCardapio(raw, HOJE)
    expect(c.categorias).toHaveLength(0)
  })
})

function entrada(
  evento: EntradaTurno['evento'],
  estado: Partial<EstadoFluxo>,
  loja: Partial<EntradaTurno['loja']> = {},
): EntradaTurno {
  return {
    evento,
    estado: {
      etapa: 'confirmar', carrinho: [{ item_id: 'i1', quantidade: 1, opcoes_ids: [] }], apresentados: [],
      categoria_id: null, item_id: null, grupos_pendentes: [], opcoes_grupo: [], opcoes_ids: [], endereco_id: null,
      aguardando: null, bairro_rascunho: null, pagamento: null, pedido_id: null, codigo: null, falhas: 0,
      fluxo_versao_id: null, ...estado,
    },
    loja: { id: 'l1', nome: 'Loja', modo: 'atendimento', pausada_agora: false, ...loja },
    cliente: { id: 'cli', nome: null, telefone_hash: 'x'.repeat(64) },
    cardapio: { categorias: [], itensPorCategoria: new Map(), itensPorId: new Map(), gruposPorItem: new Map() },
    ultimoEnderecoId: 'end1',
    ultimoEnderecoBairro: 'Centro',
    zonasBairros: ['Centro'],
    pedidoStatus: null,
    agora: HOJE,
  }
}

const NODE_CTX = { loja_id: 'l1', conversa_id: 'conv1' }

/** Entrada de saudacao com `n` categorias e um `modo` dado (default atendimento). */
function entradaSaudacao(modo: ModoAtendente, categorias: readonly CategoriaCtx[]): EntradaTurno {
  const e = entrada({ tipo: 'texto', texto: 'oi', botaoId: null }, { etapa: 'saudacao', carrinho: [] }, { modo })
  return { ...e, cardapio: { ...e.cardapio, categorias } }
}
const UMA_CATEGORIA: CategoriaCtx[] = [{ id: 'c1', nome: 'Lanches' }]

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

describe('saudacao por modo do atendente (disponibilidade, fonte unica)', () => {
  it('fechado: responde loja fechada, nao abre pedido e encerra', async () => {
    const saida = await saudacaoNode.executar(entradaSaudacao('fechado', UMA_CATEGORIA), {}, NODE_CTX)
    expect(saida.proximo).toBeNull()
    expect(saida.efeitos.some((e) => e.tipo === EFEITO.encerrar)).toBe(true)
    expect((saida.mensagens[0] as { texto: string }).texto.toLowerCase()).toContain('fechada')
  })

  it('atendimento: abre o cardapio com a saudacao normal (sem aviso de agendamento)', async () => {
    const saida = await saudacaoNode.executar(entradaSaudacao('atendimento', UMA_CATEGORIA), {}, NODE_CTX)
    expect(saida.proximo).toBe('pedir_categoria')
    const texto = (saida.mensagens[0] as { texto: string }).texto
    expect(texto).toContain('Bem-vindo')
    expect(texto.toLowerCase()).not.toContain('agendad')
  })

  it('agendamento: abre o cardapio deixando claro que o pedido e agendado, sem prometer entrega imediata', async () => {
    const saida = await saudacaoNode.executar(entradaSaudacao('agendamento', UMA_CATEGORIA), {}, NODE_CTX)
    expect(saida.proximo).toBe('pedir_categoria')
    const texto = (saida.mensagens[0] as { texto: string }).texto.toLowerCase()
    expect(texto).toContain('agendad')
    expect(texto).toContain('horario de atendimento')
    expect(texto).not.toMatch(/\d+\s*min/) // nunca promete "sai em X min"
  })

  it('sem categorias (qualquer modo aberto): avisa indisponivel e encerra', async () => {
    const saida = await saudacaoNode.executar(entradaSaudacao('agendamento', []), {}, NODE_CTX)
    expect(saida.proximo).toBeNull()
    expect(saida.efeitos.some((e) => e.tipo === EFEITO.encerrar)).toBe(true)
  })
})

describe('agendamento nao promete entrega imediata', () => {
  it('aviso de pedido recebido: atendimento fala do preparo; agendamento fala de pedido agendado', () => {
    const atendimento = mensagemPedidoRecebido('A01', 2500, 'atendimento')
    const agendamento = mensagemPedidoRecebido('A01', 2500, 'agendamento')
    expect(atendimento).toContain('quando comecar o preparo')
    expect(atendimento.toLowerCase()).not.toContain('agendad')
    expect(agendamento.toLowerCase()).toContain('agendad')
    expect(agendamento).toContain('horario de atendimento')
    expect(agendamento).not.toMatch(/\d+\s*min/)
  })

  it('acompanhar: pedido novo no modo agendamento nao promete entrega imediata', async () => {
    const base = entrada({ tipo: 'texto', texto: 'cade meu pedido', botaoId: null }, { etapa: 'acompanhar' }, { modo: 'agendamento' })
    const saida = await acompanharNode.executar({ ...base, pedidoStatus: 'novo' }, {}, NODE_CTX)
    const texto = (saida.mensagens[0] as { texto: string }).texto.toLowerCase()
    expect(texto).toContain('agendad')
    expect(texto).toContain('horario de atendimento')
    expect(texto).not.toMatch(/\d+\s*min/)
  })

  it('acompanhar: pedido novo no modo atendimento mantem a copy de preparo imediato', async () => {
    const base = entrada({ tipo: 'texto', texto: 'cade meu pedido', botaoId: null }, { etapa: 'acompanhar' }, { modo: 'atendimento' })
    const saida = await acompanharNode.executar({ ...base, pedidoStatus: 'novo' }, {}, NODE_CTX)
    const texto = (saida.mensagens[0] as { texto: string }).texto.toLowerCase()
    expect(texto).toContain('fila de preparo')
    expect(texto).not.toContain('agendad')
  })
})

describe('texto livre -> harness (elegibilidade)', () => {
  const registry = criarRegistry()
  const texto = { tipo: 'texto', texto: 'quero um burger', botaoId: null } as const
  const elegivel = (etapa: string, evento: EntradaTurno['evento'], estado: Partial<EstadoFluxo> = {}) =>
    elegivelParaHarness(registry.get(etapa)!, entrada(evento, { etapa, carrinho: [], ...estado }))

  it('texto livre nas etapas de entendimento vai ao harness', () => {
    expect(elegivel('pedir_categoria', texto)).toBe(true)
    expect(elegivel('montar_pedido', texto)).toBe(true)
  })

  it('botao, numero de menu e sub-passos deterministicos nao vao ao harness', () => {
    expect(elegivel('pedir_categoria', { tipo: 'botao', texto: null, botaoId: 'x' })).toBe(false)
    expect(elegivel('pedir_categoria', { tipo: 'texto', texto: '1', botaoId: null }, { apresentados: ['cat1'] })).toBe(false)
    expect(elegivel('montar_pedido', texto, { item_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' })).toBe(false)
    expect(elegivel('endereco', texto, { aguardando: 'endereco_rua' })).toBe(false)
  })

  it('confirmar, saudacao, pagamento e acompanhar nunca vao ao harness (SEC-061)', () => {
    for (const etapa of ['confirmar', 'saudacao', 'pagamento', 'acompanhar', 'endereco']) {
      expect(elegivel(etapa, texto)).toBe(false)
    }
  })
})

describe('validarRascunho (proposta do harness validada pelo motor)', () => {
  const ITEM = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
  const cardapio = (): EntradaTurno['cardapio'] => ({
    categorias: [],
    itensPorCategoria: new Map(),
    itensPorId: new Map([[ITEM, { id: ITEM, categoria_id: 'c', nome: 'Burger', preco_centavos: 2000 }]]),
    gruposPorItem: new Map([[ITEM, []]]),
  })

  it('aceita linha valida do cardapio vivo', () => {
    expect(validarRascunho(cardapio(), { linhas: [{ item_id: ITEM, quantidade: 2, opcoes_ids: [] }] })).toEqual([
      { item_id: ITEM, quantidade: 2, opcoes_ids: [] },
    ])
  })

  it('recusa item fora do cardapio, quantidade invalida e observacao livre', () => {
    const outro = '5b2504e0-4f89-41d3-9a0c-0305e82c3302'
    expect(validarRascunho(cardapio(), { linhas: [{ item_id: outro, quantidade: 1, opcoes_ids: [] }] })).toBeNull()
    expect(validarRascunho(cardapio(), { linhas: [{ item_id: ITEM, quantidade: 0, opcoes_ids: [] }] })).toBeNull()
    expect(validarRascunho(cardapio(), { linhas: [{ item_id: ITEM, quantidade: 1, opcoes_ids: [], observacao: 'x' }] })).toBeNull()
    expect(validarRascunho(cardapio(), { linhas: [] })).toBeNull()
  })
})

describe('criarRegistry', () => {
  it('monta o registry com todos os nodes do grafo e so o entendimento de texto livre declara LLM', () => {
    const r = criarRegistry()
    expect(r.size).toBe(7)
    for (const node of r.values()) expect(node.usaLlm).toBe(NODES_COM_LLM.has(node.tipo))
    expect([...NODES_COM_LLM].sort()).toEqual(['montar_pedido', 'pedir_categoria'])
  })
})
