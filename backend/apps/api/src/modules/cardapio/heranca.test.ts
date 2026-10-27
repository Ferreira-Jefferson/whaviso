// Heranca da categoria + excecao por item, ponta a ponta (banco real, arvore resolvida).
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chamar, encerrar, montarMundo, online, type Mundo } from './test/apoio'

const d = online ? describe : describe.skip

interface G {
  id: string
}
interface ItemArv {
  id: string
  pedivel: boolean
  grupos: { id: string; origem: string; opcoes: { id: string; disponivel: boolean }[] }[]
}

d('cardapio: heranca e excecao', () => {
  let m: Mundo
  const dono = () => m.dono
  const A = () => m.lojaA
  beforeAll(async () => {
    m = await montarMundo()
  })
  afterAll(async () => {
    await encerrar(m)
  })

  async function grupo(nome: string, opcoes = ['x', 'y']): Promise<G> {
    const r = await chamar(m, dono(), A(), 'POST', '/grupos', { nome, opcoes: opcoes.map((n) => ({ nome: n })) })
    return r.corpo
  }
  async function cenario(): Promise<{ cat: string; item: string; g1: G; g2: G; g3: G }> {
    const [g1, g2, g3] = [await grupo('G1'), await grupo('G2'), await grupo('G3')] as [G, G, G]
    const cat = (await chamar(m, dono(), A(), 'POST', '/categorias', { nome: `Cat ${Math.random()}` })).corpo.id
    await chamar(m, dono(), A(), 'PUT', `/categorias/${cat}/grupos`, {
      grupos: [
        { grupo_id: g2.id, ordem: 2 },
        { grupo_id: g1.id, ordem: 1 },
      ],
    })
    const item = (await chamar(m, dono(), A(), 'POST', '/itens', { categoria_id: cat, nome: 'Pizza', preco_centavos: 3000 })).corpo.id
    return { cat, item, g1, g2, g3 }
  }
  async function itemNaArvore(id: string): Promise<ItemArv> {
    const arv = await chamar(m, dono(), A(), 'GET', '/')
    const todos: ItemArv[] = arv.corpo.categorias.flatMap((c: { itens: ItemArv[] }) => c.itens)
    return todos.find((i) => i.id === id)!
  }
  const gids = (i: ItemArv): string[] => i.grupos.map((g) => g.id)

  it('item herda os grupos da categoria na ordem do vinculo', async () => {
    const { item, g1, g2 } = await cenario()
    const i = await itemNaArvore(item)
    expect(gids(i)).toEqual([g1.id, g2.id])
    expect(i.grupos.every((g) => g.origem === 'categoria')).toBe(true)
    expect(i.grupos[0]!.opcoes.length).toBe(2)
  })

  it('excecao remove o herdado e acrescenta um grupo que a categoria nao tem', async () => {
    const { item, g1, g2, g3 } = await cenario()
    const r = await chamar(m, dono(), A(), 'PUT', `/itens/${item}/grupos`, {
      excecoes: [
        { grupo_id: g2.id, incluir: false },
        { grupo_id: g3.id, incluir: true, ordem: 9 },
      ],
    })
    expect(r.status).toBe(200)
    expect(r.corpo.excecoes.map((e: { grupo_id: string }) => e.grupo_id).sort()).toEqual([g2.id, g3.id].sort())
    const i = await itemNaArvore(item)
    expect(gids(i)).toEqual([g1.id, g3.id])
    expect(i.grupos[1]!.origem).toBe('item')
  })

  it('exceoes redundantes sao rejeitadas (acrescentar herdado, remover nao herdado)', async () => {
    const { item, g1, g3 } = await cenario()
    const a = await chamar(m, dono(), A(), 'PUT', `/itens/${item}/grupos`, { excecoes: [{ grupo_id: g1.id, incluir: true }] })
    expect(a.status).toBe(422)
    expect(a.corpo.error.code).toBe('excecao_redundante')
    const b = await chamar(m, dono(), A(), 'PUT', `/itens/${item}/grupos`, { excecoes: [{ grupo_id: g3.id, incluir: false }] })
    expect(b.corpo.error.code).toBe('excecao_redundante')
    const dup = await chamar(m, dono(), A(), 'PUT', `/itens/${item}/grupos`, {
      excecoes: [
        { grupo_id: g3.id, incluir: true },
        { grupo_id: g3.id, incluir: true },
      ],
    })
    expect(dup.corpo.error.code).toBe('ids_duplicados')
  })

  it('PUT e idempotente e substitui: omitir uma excecao a desfaz', async () => {
    const { item, g1, g2, g3 } = await cenario()
    const corpo = {
      excecoes: [
        { grupo_id: g2.id, incluir: false },
        { grupo_id: g3.id, incluir: true },
      ],
    }
    const um = await chamar(m, dono(), A(), 'PUT', `/itens/${item}/grupos`, corpo)
    const dois = await chamar(m, dono(), A(), 'PUT', `/itens/${item}/grupos`, corpo)
    expect(dois.corpo).toEqual(um.corpo)

    await chamar(m, dono(), A(), 'PUT', `/itens/${item}/grupos`, { excecoes: [{ grupo_id: g2.id, incluir: false }] })
    expect(gids(await itemNaArvore(item))).toEqual([g1.id])

    const vazio = await chamar(m, dono(), A(), 'PUT', `/itens/${item}/grupos`, { excecoes: [] })
    expect(vazio.corpo.excecoes).toEqual([])
    expect(gids(await itemNaArvore(item))).toEqual([g1.id, g2.id])
  })

  it('categoria que ganha um grupo depois: rastro de exclusao antiga nao o esconde', async () => {
    const { cat, item, g1, g2, g3 } = await cenario()
    await chamar(m, dono(), A(), 'PUT', `/itens/${item}/grupos`, { excecoes: [{ grupo_id: g3.id, incluir: true }] })
    await chamar(m, dono(), A(), 'PUT', `/itens/${item}/grupos`, { excecoes: [] }) // g3 vira rastro neutro
    await chamar(m, dono(), A(), 'PUT', `/categorias/${cat}/grupos`, {
      grupos: [
        { grupo_id: g1.id, ordem: 1 },
        { grupo_id: g2.id, ordem: 2 },
        { grupo_id: g3.id, ordem: 3 },
      ],
    })
    expect(gids(await itemNaArvore(item))).toEqual([g1.id, g2.id, g3.id])
  })

  it('PUT de vinculos da categoria: idempotente, reordena, nao remove', async () => {
    const { cat, g1, g2 } = await cenario()
    const inv = {
      grupos: [
        { grupo_id: g1.id, ordem: 5 },
        { grupo_id: g2.id, ordem: 1 },
      ],
    }
    const r1 = await chamar(m, dono(), A(), 'PUT', `/categorias/${cat}/grupos`, inv)
    const r2 = await chamar(m, dono(), A(), 'PUT', `/categorias/${cat}/grupos`, inv)
    expect(r1.corpo).toEqual(r2.corpo)
    expect(r1.corpo.grupos.map((g: { grupo_id: string }) => g.grupo_id)).toEqual([g2.id, g1.id])
    const remover = await chamar(m, dono(), A(), 'PUT', `/categorias/${cat}/grupos`, { grupos: [{ grupo_id: g1.id }] })
    expect(remover.status).toBe(422)
    expect(remover.corpo.error.code).toBe('remocao_vinculo_nao_suportada')
  })

  it('mover o item de categoria reseta as excecoes e avisa', async () => {
    const { item, g1, g2, g3 } = await cenario()
    await chamar(m, dono(), A(), 'PUT', `/itens/${item}/grupos`, {
      excecoes: [
        { grupo_id: g2.id, incluir: false },
        { grupo_id: g3.id, incluir: true },
      ],
    })
    const outra = (await chamar(m, dono(), A(), 'POST', '/categorias', { nome: 'Outra' })).corpo.id
    await chamar(m, dono(), A(), 'PUT', `/categorias/${outra}/grupos`, { grupos: [{ grupo_id: g1.id, ordem: 0 }] })
    const mov = await chamar(m, dono(), A(), 'PATCH', `/itens/${item}`, { categoria_id: outra })
    expect(mov.status).toBe(200)
    expect(mov.corpo.excecoes_resetadas).toBe(true)
    expect(mov.corpo.excecoes).toEqual([])
    expect(gids(await itemNaArvore(item))).toEqual([g1.id])
    const semMover = await chamar(m, dono(), A(), 'PATCH', `/itens/${item}`, { nome: 'Pizza 2' })
    expect(semMover.corpo.excecoes_resetadas).toBe(false)
  })

  it('grupo inativo some da arvore; opcao indisponivel sai do pedivel mas fica no painel', async () => {
    const { item, g1, g2 } = await cenario()
    await chamar(m, dono(), A(), 'PATCH', `/grupos/${g2.id}`, { ativo: false })
    const i = await itemNaArvore(item)
    expect(gids(i)).toEqual([g1.id])

    const opId = i.grupos[0]!.opcoes[0]!.id
    await chamar(m, dono(), A(), 'POST', `/opcoes/${opId}/disponibilidade`, { esgotado_hoje: true })
    const painel = await itemNaArvore(item)
    expect(painel.grupos[0]!.opcoes.find((o) => o.id === opId)!.disponivel).toBe(false)
    const pub = await chamar(m, dono(), A(), 'GET', '/publico-resolvido')
    const noPub: ItemArv | undefined = pub.corpo.categorias
      .flatMap((c: { itens: ItemArv[] }) => c.itens)
      .find((x: ItemArv) => x.id === item)
    expect(noPub!.grupos[0]!.opcoes.map((o) => o.id)).not.toContain(opId)
  })

  it('grupo obrigatorio sem opcoes disponiveis torna o item nao pedivel', async () => {
    const g = (await chamar(m, dono(), A(), 'POST', '/grupos', {
      nome: 'Tam obrig',
      tipo: 'tamanho',
      obrigatorio: true,
      opcoes: [{ nome: 'unico' }],
    })).corpo
    const cat = (await chamar(m, dono(), A(), 'POST', '/categorias', { nome: 'Obrig' })).corpo.id
    await chamar(m, dono(), A(), 'PUT', `/categorias/${cat}/grupos`, { grupos: [{ grupo_id: g.id }] })
    const item = (await chamar(m, dono(), A(), 'POST', '/itens', { categoria_id: cat, nome: 'Combo' })).corpo.id
    expect((await itemNaArvore(item)).pedivel).toBe(true)
    await chamar(m, dono(), A(), 'POST', `/opcoes/${g.opcoes[0].id}/disponibilidade`, { ativo: false })
    expect((await itemNaArvore(item)).pedivel).toBe(false)
  })

  it('categoria fora da programacao: itens nao pedíveis agora', async () => {
    const cat = (await chamar(m, dono(), A(), 'POST', '/categorias', { nome: 'Nunca' })).corpo.id
    // janela de 1 minuto num dia/hora que raramente coincide com "agora"; troca para o dia seguinte.
    const dia = (new Date().getUTCDay() + 3) % 7
    await chamar(m, dono(), A(), 'PATCH', `/categorias/${cat}`, {
      programacao: { janelas: [{ dias: [dia], inicio: '03:00', fim: '03:01' }] },
    })
    const item = (await chamar(m, dono(), A(), 'POST', '/itens', { categoria_id: cat, nome: 'Fora' })).corpo.id
    const painel = await itemNaArvore(item)
    expect(painel.pedivel).toBe(false)
    const pub = await chamar(m, dono(), A(), 'GET', '/publico-resolvido')
    expect(JSON.stringify(pub.corpo)).not.toContain(item)
  })
})
