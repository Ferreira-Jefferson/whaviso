// E16: Categorias definidas pelo usuário. Cobre:
//  - criar/listar/renomear/arquivar, isolamento por conta (H16.1/H16.2);
//  - nome único por conta (case-insensitive) -> 409 categoria_duplicada;
//  - vincular categoria ao criar combinado e filtrar o painel por categoria (H16.3/H16.4);
//  - editar a categoria de um combinado é LIVRE (não abre reaprovação);
//  - categoria de OUTRA conta é recusada ao criar combinado (categoria_invalida).
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { criarAppTeste, criarUsuario, encerrarPools, limparUsuario } from '../../../../test/harness'

const AUTH = { authorization: 'Bearer x' }

afterAll(async () => {
  await encerrarPools()
})

async function criarCategoria(app: Awaited<ReturnType<typeof criarAppTeste>>, nome: string, cor?: string) {
  return app.inject({ method: 'POST', url: '/v1/categorias', headers: AUTH, payload: { nome, cor } })
}

function bodyAgenda(nome: string, categoria_ids?: string[]) {
  return {
    direcao: 'receber' as const,
    modo: 'agenda' as const,
    nome_devedor: nome,
    // Telefone da outra ponta é obrigatório mesmo na agenda (H4.1); só o Pix é diferido.
    telefone_devedor: '+5511999998888',
    motivo: 'pedido do catalogo',
    itens: [{ descricao: 'Item', qtd: 1, valor_unit_centavos: 8990 }],
    data_combinada: '2026-08-01',
    ...(categoria_ids ? { categoria_ids } : {}),
  }
}

describe('categorias (integração)', () => {
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
    const c1 = await criarCategoria(app, 'Natura', '#1e4d3b')
    expect(c1.statusCode).toBe(201)
    expect(c1.json().nome).toBe('Natura')

    const dup = await criarCategoria(app, 'natura')
    expect(dup.statusCode).toBe(409)
    expect(dup.json().error.code).toBe('categoria_duplicada')

    await criarCategoria(app, 'Boticário')
    const lista = await app.inject({ method: 'GET', url: '/v1/categorias', headers: AUTH })
    await app.close()
    expect(lista.statusCode).toBe(200)
    const nomes = lista.json().map((c: { nome: string }) => c.nome)
    expect(nomes).toEqual(['Boticário', 'Natura']) // ordenado por nome
  })

  it('renomeia e arquiva (soft-delete some da lista)', async () => {
    const app = await criarAppTeste(uid)
    const id = (await criarCategoria(app, 'Bijus')).json().id
    const ren = await app.inject({
      method: 'PATCH',
      url: `/v1/categorias/${id}`,
      headers: AUTH,
      payload: { nome: 'Bijuterias' },
    })
    expect(ren.statusCode).toBe(200)
    expect(ren.json().nome).toBe('Bijuterias')

    await app.inject({ method: 'PATCH', url: `/v1/categorias/${id}`, headers: AUTH, payload: { arquivada: true } })
    const lista = await app.inject({ method: 'GET', url: '/v1/categorias', headers: AUTH })
    await app.close()
    expect(lista.json()).toHaveLength(0)
  })

  it('vincula categoria ao combinado e filtra o painel por categoria', async () => {
    const app = await criarAppTeste(uid)
    const catId = (await criarCategoria(app, 'Natura')).json().id

    const comCat = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: bodyAgenda('Ana', [catId]) })
    expect(comCat.statusCode).toBe(201)
    expect(comCat.json().aviso.categoria_ids).toEqual([catId])

    await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: bodyAgenda('Bruno') })

    const soCat = await app.inject({ method: 'GET', url: `/v1/avisos?papel=cobrador&categoria_id=${catId}`, headers: AUTH })
    expect(soCat.json().total).toBe(1)
    expect(soCat.json().itens[0].nome_devedor).toBe('Ana')

    const semCat = await app.inject({ method: 'GET', url: '/v1/avisos?papel=cobrador&sem_categoria=true', headers: AUTH })
    await app.close()
    expect(semCat.json().total).toBe(1)
    expect(semCat.json().itens[0].nome_devedor).toBe('Bruno')
  })

  it('editar a categoria de um combinado é livre (fica sem_aviso, não vai a reaprovação)', async () => {
    const app = await criarAppTeste(uid)
    const catId = (await criarCategoria(app, 'Natura')).json().id
    const avisoId = (await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: bodyAgenda('Ana') })).json().aviso.id

    const edit = await app.inject({
      method: 'PATCH',
      url: `/v1/avisos/${avisoId}`,
      headers: AUTH,
      payload: { categoria_ids: [catId] },
    })
    await app.close()
    expect(edit.statusCode).toBe(200)
    expect(edit.json().categoria_ids).toEqual([catId])
    expect(edit.json().status).toBe('sem_aviso') // não foi para aguardando_aprovacao_aviso_editado
  })

  it('recusa categoria de outra conta ao criar combinado', async () => {
    const outro = await criarUsuario('Outra')
    const appOutro = await criarAppTeste(outro)
    const catAlheia = (await criarCategoria(appOutro, 'Alheia')).json().id
    await appOutro.close()

    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: bodyAgenda('Ana', [catAlheia]) })
    await app.close()
    await limparUsuario(outro)
    expect(r.statusCode).toBeGreaterThanOrEqual(400)
    expect(r.json().error.code).toBe('categoria_invalida')
  })

  it('aceita múltiplas categorias e o filtro "contém" acha por qualquer uma delas', async () => {
    const app = await criarAppTeste(uid)
    const natura = (await criarCategoria(app, 'Natura')).json().id
    const presentes = (await criarCategoria(app, 'Presentes')).json().id

    const criado = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: bodyAgenda('Ana', [natura, presentes]),
    })
    expect(criado.statusCode).toBe(201)
    expect(criado.json().aviso.categoria_ids.slice().sort()).toEqual([natura, presentes].slice().sort())

    // "Contém": aparece filtrando por qualquer uma das suas categorias.
    const porNatura = await app.inject({ method: 'GET', url: `/v1/avisos?papel=cobrador&categoria_id=${natura}`, headers: AUTH })
    expect(porNatura.json().total).toBe(1)
    const porPresentes = await app.inject({ method: 'GET', url: `/v1/avisos?papel=cobrador&categoria_id=${presentes}`, headers: AUTH })
    expect(porPresentes.json().total).toBe(1)

    // Editar para só uma categoria limpa a outra (delete-all + insert).
    const soNatura = await app.inject({
      method: 'PATCH',
      url: `/v1/avisos/${criado.json().aviso.id}`,
      headers: AUTH,
      payload: { categoria_ids: [natura] },
    })
    expect(soNatura.json().categoria_ids).toEqual([natura])
    const aindaPresentes = await app.inject({ method: 'GET', url: `/v1/avisos?papel=cobrador&categoria_id=${presentes}`, headers: AUTH })
    await app.close()
    expect(aindaPresentes.json().total).toBe(0)
  })
})
