// Fase A: autocomplete do nome do item (POST /v1/itens/buscar-por-nome). Cobre:
//  - sugere descrições de itens já usadas pelo criador que casam com o prefixo;
//  - distinct (a mesma descrição usada em dois combinados aparece uma vez);
//  - ordem ascendente;
//  - isolamento por usuário (itens de outra conta não vazam);
//  - 401 sem token.
// Integração com whaviso_dev (app real + DB). Espelha pessoas/buscar-por-telefone.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  criarAppTeste,
  criarUsuario,
  encerrarPools,
  limparUsuario,
} from '../../../../test/harness'

const AUTH = { authorization: 'Bearer x' }

afterAll(async () => {
  await encerrarPools()
})

// Cria uma anotação de agenda (sem_aviso: não reserva crédito) só para semear os itens do
// pedido do criador. O valor é DERIVADO da soma dos itens (contrato Fase A).
async function semearAviso(
  app: Awaited<ReturnType<typeof criarAppTeste>>,
  itens: { descricao: string; qtd: number; valor_unit_centavos: number }[],
) {
  const r = await app.inject({
    method: 'POST',
    url: '/v1/avisos',
    headers: AUTH,
    payload: {
      direcao: 'receber',
      modo: 'agenda',
      nome_devedor: 'Cliente',
      motivo: 'pedido do catalogo',
      itens,
      data_combinada: '2026-08-01',
    },
  })
  expect(r.statusCode).toBe(201)
}

describe('itens: autocomplete por nome (integração)', () => {
  let uid: string

  beforeAll(async () => {
    uid = await criarUsuario('Revendedora')
    const app = await criarAppTeste(uid)
    // Combinado 1: dois itens (um perfume + um batom).
    await semearAviso(app, [
      { descricao: 'Perfume Essencial', qtd: 2, valor_unit_centavos: 12000 },
      { descricao: 'Batom', qtd: 1, valor_unit_centavos: 3500 },
    ])
    // Combinado 2: outro perfume.
    await semearAviso(app, [{ descricao: 'Perfume Amadeirado', qtd: 1, valor_unit_centavos: 15000 }])
    // Combinado 3: repete 'Perfume Essencial' (exercita o distinct).
    await semearAviso(app, [{ descricao: 'Perfume Essencial', qtd: 1, valor_unit_centavos: 12000 }])
    await app.close()
  })
  afterAll(async () => {
    await limparUsuario(uid)
  })

  it('sem token → 401', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'POST', url: '/v1/itens/buscar-por-nome', payload: { prefixo: 'Perf' } })
    await app.close()
    expect(r.statusCode).toBe(401)
  })

  it('sugere as descrições do criador que casam com o prefixo, em ordem ascendente, sem os que não casam', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/itens/buscar-por-nome',
      headers: AUTH,
      payload: { prefixo: 'Perf' },
    })
    await app.close()
    expect(r.statusCode).toBe(200)
    const itens: string[] = r.json().itens
    // Ambos os perfumes, ordenados; 'Batom' (não casa) fora.
    expect(itens).toEqual(['Perfume Amadeirado', 'Perfume Essencial'])
    expect(itens).not.toContain('Batom')
  })

  it('distinct: a mesma descrição usada em dois combinados aparece uma vez', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/itens/buscar-por-nome',
      headers: AUTH,
      payload: { prefixo: 'Perfume E' },
    })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().itens).toEqual(['Perfume Essencial'])
  })

  it('isolamento: itens de OUTRO usuário não são sugeridos', async () => {
    const outro = await criarUsuario('Concorrente')
    try {
      const appOutro = await criarAppTeste(outro)
      await semearAviso(appOutro, [{ descricao: 'Perfume Proibido', qtd: 1, valor_unit_centavos: 9900 }])
      await appOutro.close()

      const app = await criarAppTeste(uid)
      const r = await app.inject({
        method: 'POST',
        url: '/v1/itens/buscar-por-nome',
        headers: AUTH,
        payload: { prefixo: 'Perfume P' },
      })
      await app.close()
      expect(r.statusCode).toBe(200)
      // O item do outro usuário não vaza para a minha busca.
      expect(r.json().itens).toEqual([])
    } finally {
      await limparUsuario(outro)
    }
  })
})
