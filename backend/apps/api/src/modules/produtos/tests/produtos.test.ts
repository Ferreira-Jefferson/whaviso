// E17: Catálogo de produtos. Cobre:
//  - criar/listar/renomear/arquivar, isolamento por conta (H17.1/H17.2/H17.4);
//  - nome único por conta (case-insensitive) -> 409 produto_duplicado;
//  - renomear PROPAGA para a descrição dos itens que referenciam o produto, SEM tocar no
//    valor_unit_centavos (snapshot congelado, H17.3);
//  - PATCH só de preço NÃO propaga (decisão E17);
//  - a propagação não vaza entre donos.
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarAppTeste, criarUsuario, encerrarPools, limparUsuario } from '../../../../test/harness'

const AUTH = { authorization: 'Bearer x' }

afterAll(async () => {
  await encerrarPools()
})

async function criarProduto(
  app: Awaited<ReturnType<typeof criarAppTeste>>,
  nome: string,
  preco: number,
) {
  return app.inject({ method: 'POST', url: '/v1/produtos', headers: AUTH, payload: { nome, preco_venda_centavos: preco } })
}

function bodyAvisoComProduto(nome: string, produtoId: string, descricao: string, preco: number) {
  return {
    direcao: 'receber' as const,
    modo: 'agenda' as const,
    nome_devedor: nome,
    telefone_devedor: '+5511999997777',
    motivo: 'pedido do catalogo',
    itens: [{ descricao, qtd: 2, valor_unit_centavos: preco, produto_id: produtoId }],
    data_combinada: '2026-08-01',
  }
}

describe('produtos (integração)', () => {
  let uid: string

  beforeEach(async () => {
    if (uid) await limparUsuario(uid)
    uid = await criarUsuario('Revendedora')
  })
  afterAll(async () => {
    if (uid) await limparUsuario(uid)
  })

  it('cria, lista e impede nome duplicado (case-insensitive)', async () => {
    const app = await criarAppTeste(uid)
    const p1 = await criarProduto(app, 'Batom vermelho', 2990)
    expect(p1.statusCode).toBe(201)
    expect(p1.json()).toMatchObject({ nome: 'Batom vermelho', preco_venda_centavos: 2990 })

    const dup = await criarProduto(app, 'batom vermelho', 3000)
    expect(dup.statusCode).toBe(409)
    expect(dup.json().error.code).toBe('produto_duplicado')

    await criarProduto(app, 'Base líquida', 4990)
    const lista = await app.inject({ method: 'GET', url: '/v1/produtos', headers: AUTH })
    await app.close()
    expect(lista.json().map((p: { nome: string }) => p.nome)).toEqual(['Base líquida', 'Batom vermelho'])
  })

  it('renomear PROPAGA a descrição dos itens (sem tocar no preço); arquivar some da lista', async () => {
    const app = await criarAppTeste(uid)
    const prod = (await criarProduto(app, 'Batom', 2990)).json()

    // Combinado usando o produto (item com produto_id + snapshot de descrição/preço).
    const criado = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: bodyAvisoComProduto('Ana', prod.id, 'Batom', 2990),
    })
    const avisoId = criado.json().aviso.id

    // Renomeia o produto: a descrição do item propaga; valor_unit_centavos permanece.
    const ren = await app.inject({
      method: 'PATCH',
      url: `/v1/produtos/${prod.id}`,
      headers: AUTH,
      payload: { nome: 'Batom rosa' },
    })
    expect(ren.statusCode).toBe(200)
    expect(ren.json().nome).toBe('Batom rosa')

    const depois = (await app.inject({ method: 'GET', url: `/v1/avisos/${avisoId}`, headers: AUTH })).json()
    expect(depois.itens[0].descricao).toBe('Batom rosa') // propagou o rótulo
    expect(depois.itens[0].valor_unit_centavos).toBe(2990) // preço congelado (snapshot)

    // Arquivar some da lista, mas não altera o combinado.
    await app.inject({ method: 'PATCH', url: `/v1/produtos/${prod.id}`, headers: AUTH, payload: { arquivado: true } })
    const lista = await app.inject({ method: 'GET', url: '/v1/produtos', headers: AUTH })
    await app.close()
    expect(lista.json()).toHaveLength(0)
  })

  it('PATCH só de preço NÃO propaga para combinados existentes (snapshot congelado)', async () => {
    const app = await criarAppTeste(uid)
    const prod = (await criarProduto(app, 'Perfume', 9990)).json()
    const avisoId = (
      await app.inject({
        method: 'POST',
        url: '/v1/avisos',
        headers: AUTH,
        payload: bodyAvisoComProduto('Bia', prod.id, 'Perfume', 9990),
      })
    ).json().aviso.id

    await app.inject({ method: 'PATCH', url: `/v1/produtos/${prod.id}`, headers: AUTH, payload: { preco_venda_centavos: 12990 } })

    const depois = (await app.inject({ method: 'GET', url: `/v1/avisos/${avisoId}`, headers: AUTH })).json()
    await app.close()
    expect(depois.itens[0].descricao).toBe('Perfume') // inalterado
    expect(depois.itens[0].valor_unit_centavos).toBe(9990) // preço do combinado NÃO muda
    expect(depois.valor_centavos).toBe(2 * 9990)
  })

  it('a propagação de nome não vaza entre donos', async () => {
    const outro = await criarUsuario('Outra')
    const appOutro = await criarAppTeste(outro)
    // Produto do OUTRO com o mesmo id de vínculo simulado num combinado do outro dono.
    const prodOutro = (await criarProduto(appOutro, 'Item X', 1000)).json()
    const avisoOutro = (
      await appOutro.inject({
        method: 'POST',
        url: '/v1/avisos',
        headers: AUTH,
        payload: bodyAvisoComProduto('Cliente do outro', prodOutro.id, 'Item X', 1000),
      })
    ).json().aviso.id

    const app = await criarAppTeste(uid)
    // Meu produto com o MESMO nome; renomeio o meu.
    const meu = (await criarProduto(app, 'Item Y', 1000)).json()
    await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: bodyAvisoComProduto('Meu cliente', meu.id, 'Item Y', 1000),
    })
    await app.inject({ method: 'PATCH', url: `/v1/produtos/${meu.id}`, headers: AUTH, payload: { nome: 'Item Y editado' } })
    await app.close()

    // O combinado do OUTRO dono permanece intocado.
    const doOutro = (await appOutro.inject({ method: 'GET', url: `/v1/avisos/${avisoOutro}`, headers: AUTH })).json()
    await appOutro.close()
    await limparUsuario(outro)
    expect(doOutro.itens[0].descricao).toBe('Item X')
  })
})
