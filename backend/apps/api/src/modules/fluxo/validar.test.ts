// Unidade do validador puro do grafo (sem banco): grafo padrao, ciclo, orfao, atalho que pula a
// confirmacao, handle errado, grafo gigante, config com campo extra, tipo fora do catalogo.
import { describe, it, expect } from 'vitest'
import { CATALOGO_NODES, FLUXO_PADRAO, type FluxoGrafo } from './schemas'
import { validarGrafo } from './validar'

const clone = (): FluxoGrafo => structuredClone(FLUXO_PADRAO)
const codigos = (g: FluxoGrafo) => validarGrafo(g).erros.map((e) => e.codigo)

describe('validarGrafo', () => {
  it('o fluxo padrao e valido e a validacao e deterministica', () => {
    const a = validarGrafo(FLUXO_PADRAO)
    expect(a).toEqual({ valido: true, erros: [], avisos: [] })
    expect(validarGrafo(structuredClone(FLUXO_PADRAO))).toEqual(a)
  })

  it('catalogo e fechado: so os tipos do motor, nenhum usa LLM', () => {
    expect(CATALOGO_NODES.map((d) => d.tipo)).toEqual([
      'saudacao', 'pedir_categoria', 'montar_pedido', 'confirmar', 'endereco', 'pagamento', 'acompanhar',
    ])
    expect(CATALOGO_NODES.every((d) => !d.usaLlm)).toBe(true)
  })

  it('tipo fora do catalogo (ex.: http/codigo): no_desconhecido', () => {
    const g = clone()
    g.nodes.push({ id: 'webhook', tipo: 'http_request', config: { url: 'http://x' }, posicao: { x: 0, y: 0 } })
    g.edges.push({ id: 'e_x', de: 'saudacao', handle: 'encerrar', para: 'webhook' })
    const c = codigos(g)
    expect(c).toContain('no_desconhecido')
  })

  it('config com campo extra ou valor fora da regra: config_invalida', () => {
    const g = clone()
    g.nodes.find((n) => n.id === 'saudacao')!.config = { mensagem: 'oi', script: 'x' }
    g.nodes.find((n) => n.id === 'pagamento')!.config = { metodos: ['boleto'] }
    const erros = validarGrafo(g).erros.filter((e) => e.codigo === 'config_invalida')
    expect(erros.map((e) => e.node_id).sort()).toEqual(['pagamento', 'saudacao'])
  })

  it('config aninhada demais: limite_excedido', () => {
    const g = clone()
    g.nodes[0]!.config = { a: { b: { c: { d: { e: 1 } } } } }
    expect(codigos(g)).toContain('limite_excedido')
  })

  it('handle inexistente, origem/destino ausente, handle duplicado e ligar o handle de encerrar: aresta_invalida', () => {
    const g = clone()
    g.edges.push({ id: 'a1', de: 'saudacao', handle: 'inexistente', para: 'confirmar' })
    g.edges.push({ id: 'a2', de: 'fantasma', handle: 'proximo', para: 'confirmar' })
    g.edges.push({ id: 'a3', de: 'saudacao', handle: 'proximo', para: 'confirmar' }) // duplica e_saudacao
    g.edges.push({ id: 'a4', de: 'endereco', handle: 'encerrar', para: 'pagamento' })
    const ids = validarGrafo(g).erros.filter((e) => e.codigo === 'aresta_invalida').map((e) => e.edge_id).sort()
    expect(ids).toEqual(['a1', 'a2', 'a3', 'a4'])
  })

  it('ids repetidos: id_duplicado', () => {
    const g = clone()
    g.nodes.push({ ...g.nodes[0]! })
    g.edges.push({ ...g.edges[0]! })
    expect(codigos(g).filter((c) => c === 'id_duplicado')).toHaveLength(2)
  })

  it('inicial inexistente: sem_inicio', () => {
    const g = clone()
    g.inicial = 'nao_existe'
    expect(codigos(g)).toEqual(['sem_inicio'])
  })

  it('node orfao: no_inalcancavel', () => {
    const g = clone()
    g.nodes.push({ id: 'solto', tipo: 'endereco', config: {}, posicao: { x: 0, y: 200 } })
    const e = validarGrafo(g).erros
    expect(e).toHaveLength(1)
    expect(e[0]).toMatchObject({ codigo: 'no_inalcancavel', node_id: 'solto' })
  })

  it('ciclo sem caminho ate o node terminal: ciclo_sem_saida; node sem caminho: sem_saida', () => {
    const g: FluxoGrafo = {
      inicial: 'a',
      nodes: [
        { id: 'a', tipo: 'saudacao', config: {}, posicao: { x: 0, y: 0 } },
        { id: 'b', tipo: 'confirmar', config: {}, posicao: { x: 1, y: 0 } },
        { id: 'c', tipo: 'endereco', config: {}, posicao: { x: 2, y: 0 } },
      ],
      edges: [
        { id: 'ab', de: 'a', handle: 'proximo', para: 'b' },
        { id: 'ba', de: 'b', handle: 'voltar', para: 'a' },
        { id: 'bc', de: 'b', handle: 'proximo', para: 'c' },
      ],
    }
    const e = validarGrafo(g).erros.filter((x) => x.codigo.endsWith('saida'))
    expect(e.map((x) => `${x.codigo}:${x.node_id}`)).toEqual([
      'ciclo_sem_saida:a', 'ciclo_sem_saida:b', 'sem_saida:c',
    ])
  })

  it('atalho que pula a confirmacao ate o pagamento: acao_irreversivel_sem_confirmacao (SEC-061)', () => {
    const g = clone()
    g.edges = g.edges.filter((e) => e.id !== 'e_montar')
    g.edges.push({ id: 'atalho', de: 'montar_pedido', handle: 'proximo', para: 'pagamento' })
    const e = validarGrafo(g).erros
    expect(e.map((x) => x.codigo)).toContain('acao_irreversivel_sem_confirmacao')
    expect(e.find((x) => x.codigo === 'acao_irreversivel_sem_confirmacao')!.node_id).toBe('pagamento')
  })

  it('pagamento sem confirmar no grafo: no_obrigatorio_ausente', () => {
    const g: FluxoGrafo = {
      inicial: 'p',
      nodes: [{ id: 'p', tipo: 'pagamento', config: {}, posicao: { x: 0, y: 0 } }],
      edges: [],
    }
    const c = codigos(g)
    expect(c).toContain('no_obrigatorio_ausente')
    expect(c).toContain('acao_irreversivel_sem_confirmacao')
  })

  it('grafo gigante: limite_excedido (nodes, arestas)', () => {
    const g = clone()
    for (let i = 0; i < 101; i++) {
      g.nodes.push({ id: `n${i}`, tipo: 'endereco', config: {}, posicao: { x: i, y: 0 } })
    }
    expect(codigos(g)).toEqual(['limite_excedido'])
    const h = clone()
    for (let i = 0; i < 300; i++) h.edges.push({ id: `x${i}`, de: 'saudacao', handle: 'proximo', para: 'confirmar' })
    expect(codigos(h)).toEqual(['limite_excedido'])
  })

  it('grafo acima de 256 KB: limite_excedido', () => {
    const g = clone()
    for (let i = 0; i < 90; i++) {
      g.nodes.push({
        id: `m${i}`, tipo: 'saudacao', posicao: { x: 0, y: 0 },
        config: { a: 'x'.repeat(3000), b: 'y'.repeat(0) },
      })
    }
    expect(codigos(g)).toContain('limite_excedido')
  })
})
