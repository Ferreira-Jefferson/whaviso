import { describe, expect, it } from 'vitest'
import { FLUXO_PADRAO } from '@/shared/contracts/_generated/fluxo'
import { adicionarNode, arestaDe, definirConfig, definirTransicao, removerNode, trocarTipo } from './grafo'

describe('grafo do fluxo', () => {
  it('liga e desliga a transicao de um handle', () => {
    const ligado = definirTransicao(FLUXO_PADRAO, 'saudacao', 'proximo', 'confirmar')
    expect(arestaDe(ligado, 'saudacao', 'proximo')?.para).toBe('confirmar')
    expect(ligado.edges.filter((e) => e.de === 'saudacao' && e.handle === 'proximo')).toHaveLength(1)
    const solto = definirTransicao(ligado, 'saudacao', 'proximo', null)
    expect(arestaDe(solto, 'saudacao', 'proximo')).toBeUndefined()
  })

  it('gera ids de aresta unicos', () => {
    let g = FLUXO_PADRAO
    g = definirTransicao(g, 'saudacao', 'encerrar', 'acompanhar')
    g = definirTransicao(g, 'endereco', 'encerrar', 'acompanhar')
    const ids = g.edges.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('adiciona node com id unico a direita dos demais', () => {
    const { grafo, id } = adicionarNode(FLUXO_PADRAO, 'saudacao')
    expect(id).toBe('saudacao_1')
    const novo = grafo.nodes.find((n) => n.id === id)
    expect(novo?.posicao.x).toBeGreaterThan(1320)
  })

  it('remove node com suas arestas e reatribui o inicial', () => {
    const g = removerNode(FLUXO_PADRAO, 'saudacao')
    expect(g.nodes.some((n) => n.id === 'saudacao')).toBe(false)
    expect(g.edges.some((e) => e.de === 'saudacao' || e.para === 'saudacao')).toBe(false)
    expect(g.inicial).toBe('pedir_categoria')
  })

  it('troca de tipo zera config e descarta handles invalidos', () => {
    const com = definirConfig(FLUXO_PADRAO, 'pedir_categoria', 'mensagem', 'Oi')
    const g = trocarTipo(com, 'pedir_categoria', 'acompanhar', [])
    expect(g.nodes.find((n) => n.id === 'pedir_categoria')?.config).toEqual({})
    expect(g.edges.some((e) => e.de === 'pedir_categoria')).toBe(false)
  })

  it('config undefined remove a chave', () => {
    const com = definirConfig(FLUXO_PADRAO, 'saudacao', 'mensagem', 'Oi')
    const sem = definirConfig(com, 'saudacao', 'mensagem', undefined)
    expect(sem.nodes.find((n) => n.id === 'saudacao')?.config).toEqual({})
  })
})
