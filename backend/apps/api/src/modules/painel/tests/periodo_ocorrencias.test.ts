// E9 H9.6: filtro por PERÍODO desmembra o recorrente em uma linha por OCORRÊNCIA, na
// lista (GET /v1/avisos?de&ate) e nos totais (GET /v1/painel/resumo?de&ate). Cobre:
//  - sem período = uma linha por combinado (comportamento de sempre);
//  - com período = uma linha por ocorrência (data/status próprios), simples intacto;
//  - totais somam por ocorrência (valor herdado do combinado);
//  - regra "estado global manda nas ocorrências futuras ainda não pagas" (cancelar o
//    recorrente tira as parcelas futuras de "a receber", mas a parcela já paga continua
//    contando como recebido).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  criarAppTeste,
  criarUsuario,
  encerrarPools,
  limparUsuario,
  poolSuper,
} from '../../../../test/harness'

const AUTH = { authorization: 'Bearer x' }
const VALOR = 1000 // valor do recorrente (toda ocorrência herda este)
const VALOR_SIMPLES = 500

// Insere um recorrente (cobrador=uid) + N ocorrências e devolve o id do aviso.
async function inserirRecorrente(
  uid: string,
  status: string,
  ocorrencias: ReadonlyArray<{ indice: number; data: string; status: string }>,
): Promise<string> {
  const r = await poolSuper.query<{ id: string }>(
    `insert into public.avisos
       (cobrador_id, pix_chave, direcao, criador_papel, status, nome_devedor, telefone_devedor,
        motivo, valor_centavos, data_combinada,
        recorrencia_tipo, recorrencia_freq, ocorrencias_total, ocorrencia_atual)
     values ($1,'c@pix.com','receber','cobrador',$2,'Maria','+5511999990001','aluguel',$3,$4,
             'periodo','mensal',$5,2)
     returning id`,
    [uid, status, VALOR, ocorrencias[0]!.data, ocorrencias.length],
  )
  const id = r.rows[0]!.id
  for (const o of ocorrencias) {
    await poolSuper.query(
      `insert into public.aviso_ocorrencias (aviso_id, indice, data_combinada, status)
       values ($1,$2,$3,$4)`,
      [id, o.indice, o.data, o.status],
    )
  }
  return id
}

async function inserirSimples(uid: string): Promise<string> {
  const r = await poolSuper.query<{ id: string }>(
    `insert into public.avisos
       (cobrador_id, pix_chave, direcao, criador_papel, status, nome_devedor, telefone_devedor,
        motivo, valor_centavos, data_combinada)
     values ($1,'c@pix.com','receber','cobrador','programado','Joao','+5511999990002','curso',$2,'2026-04-15')
     returning id`,
    [uid, VALOR_SIMPLES],
  )
  return r.rows[0]!.id
}

const OCORRENCIAS_BASE = [
  { indice: 1, data: '2026-03-10', status: 'pago' },
  { indice: 2, data: '2026-04-10', status: 'informado_pago' },
  { indice: 3, data: '2026-05-10', status: 'programado' },
] as const

describe('E9 H9.6: período desmembra por ocorrência (integração)', () => {
  let uid: string
  let recId: string
  let simplesId: string

  beforeAll(async () => {
    uid = await criarUsuario('PainelPeriodo')
  })
  beforeEach(async () => {
    await poolSuper.query(`delete from public.avisos where cobrador_id=$1`, [uid])
    recId = await inserirRecorrente(uid, 'programado', OCORRENCIAS_BASE)
    simplesId = await inserirSimples(uid)
  })
  afterAll(async () => {
    await limparUsuario(uid)
    await encerrarPools()
  })

  it('lista SEM período = uma linha por combinado (recorrente colapsado)', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'GET',
      url: '/v1/avisos?papel=cobrador&ordenar=data_combinada&dir=asc&per_page=100',
      headers: AUTH,
    })
    await app.close()
    expect(r.statusCode).toBe(200)
    const b = r.json()
    expect(b.total).toBe(2) // o recorrente é UMA linha + o simples
    const rec = b.itens.find((a: { id: string }) => a.id === recId)
    expect(rec.status).toBe('programado') // status do combinado
    expect(rec.ocorrencia_atual).toBe(2) // ponteiro do combinado
    expect(rec.data_combinada).toBe('2026-03-10') // data base do combinado
  })

  it('lista COM período = uma linha por ocorrência; simples intacto', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'GET',
      url: '/v1/avisos?papel=cobrador&de=2026-03-01&ate=2026-05-31&ordenar=data_combinada&dir=asc&per_page=100',
      headers: AUTH,
    })
    await app.close()
    const b = r.json()
    expect(b.total).toBe(4) // 3 ocorrências do recorrente + 1 simples
    const linha = (occ: number) =>
      b.itens.find((a: { id: string; ocorrencia_atual: number }) => a.id === recId && a.ocorrencia_atual === occ)
    expect(linha(1).status).toBe('pago')
    expect(linha(1).data_combinada).toBe('2026-03-10')
    expect(linha(1).valor_centavos).toBe(VALOR) // valor herdado do combinado
    expect(linha(2).status).toBe('informado_pago')
    expect(linha(2).data_combinada).toBe('2026-04-10')
    expect(linha(3).status).toBe('programado')
    expect(linha(3).data_combinada).toBe('2026-05-10')
    // O simples aparece uma vez só, com seu próprio id.
    const simples = b.itens.filter((a: { id: string }) => a.id === simplesId)
    expect(simples.length).toBe(1)
  })

  it('lista COM período recortado pega só as ocorrências dentro do intervalo', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'GET',
      url: '/v1/avisos?papel=cobrador&de=2026-04-01&ate=2026-04-30&ordenar=data_combinada&dir=asc&per_page=100',
      headers: AUTH,
    })
    await app.close()
    const b = r.json()
    // Abril: ocorrência 2 (10/04) + o simples (15/04). A 1 (mar) e a 3 (mai) ficam de fora.
    expect(b.total).toBe(2)
    expect(b.itens.some((a: { id: string; ocorrencia_atual: number }) => a.id === recId && a.ocorrencia_atual === 2)).toBe(true)
    expect(b.itens.some((a: { id: string }) => a.id === simplesId)).toBe(true)
  })

  it('totais COM período somam por ocorrência (valor herdado)', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'GET',
      url: '/v1/painel/resumo?de=2026-03-01&ate=2026-05-31',
      headers: AUTH,
    })
    await app.close()
    const b = r.json()
    // a receber (ativos não pagos): occ2 informado_pago (1000) + occ3 programado (1000) + simples (500) = 2500.
    expect(b.a_receber_centavos).toBe(2500)
    expect(b.a_receber_qtd).toBe(3)
    // recebido (pago): occ1 (1000).
    expect(b.recebido_centavos).toBe(1000)
    expect(b.recebido_qtd).toBe(1)
  })

  it('regra: cancelar o recorrente tira as parcelas FUTURAS de "a receber"; a paga segue recebido', async () => {
    // Combinado vira cancelado; a ocorrência futura ainda 'programado' herda 'cancelado'
    // (sai dos totais), a informada segue 'informado_pago' (conta a receber), a paga segue 'pago'.
    await poolSuper.query(`update public.avisos set status='cancelado' where id=$1`, [recId])
    const app = await criarAppTeste(uid)
    const lista = await app.inject({
      method: 'GET',
      url: '/v1/avisos?papel=cobrador&de=2026-03-01&ate=2026-05-31&ordenar=data_combinada&dir=asc&per_page=100',
      headers: AUTH,
    })
    const resumo = await app.inject({
      method: 'GET',
      url: '/v1/painel/resumo?de=2026-03-01&ate=2026-05-31',
      headers: AUTH,
    })
    await app.close()
    const itens = lista.json().itens
    const linha = (occ: number) =>
      itens.find((a: { id: string; ocorrencia_atual: number }) => a.id === recId && a.ocorrencia_atual === occ)
    expect(linha(1).status).toBe('pago') // já paga: mantém
    expect(linha(2).status).toBe('informado_pago') // já avançou: mantém
    expect(linha(3).status).toBe('cancelado') // futura 'programado': herda o estado global

    const b = resumo.json()
    // a receber: só occ2 (1000) + simples (500) = 1500 (occ3 virou cancelado, fora dos totais).
    expect(b.a_receber_centavos).toBe(1500)
    // recebido: occ1 segue contando mesmo com o combinado cancelado.
    expect(b.recebido_centavos).toBe(1000)
  })
})
