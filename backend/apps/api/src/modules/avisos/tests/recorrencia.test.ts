// E6 H6.10 / E8 H8.7 / E11 H11.3/H11.5: recorrência e cadência. Cobre: criar recorrente
// materializa N ocorrências; cada ocorrência reserva 1 vaga (SOMA, não count); cadência
// sem plano é recusada; cadência filtra etapas no ciclo; gate de vaga no enviar; a rota
// /ocorrencias expõe o "k de N". (A confirmação por ocorrência fica em recebimentos.)
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  criarAppTeste,
  criarUsuario,
  definirPlano,
  encerrarPools,
  limparUsuario,
  poolSuper,
} from '../../../../test/harness'

const AUTH = { authorization: 'Bearer fake' }

function corpo(over: Record<string, unknown> = {}) {
  return {
    direcao: 'receber',
    nome_devedor: 'Maria',
    telefone_devedor: '+5511999998888',
    motivo: 'mensalidade',
    valor_centavos: 9900,
    data_combinada: '2026-12-10',
    pix_chave: 'maria@pix.com',
    pix_titular: 'Maria Silva',
    pix_banco: 'Banco Exemplo',
    ...over,
  }
}

async function ocorrencias(avisoId: string) {
  const r = await poolSuper.query<{ indice: number; data_combinada: string; status: string }>(
    `select indice, to_char(data_combinada,'YYYY-MM-DD') as data_combinada, status
       from public.aviso_ocorrencias where aviso_id=$1 order by indice asc`,
    [avisoId],
  )
  return r.rows
}

async function somarVagas(uid: string): Promise<number> {
  // Espelha somarVagasAtivas: por aviso ativo, 1 (simples) ou ocorrências não pagas.
  const r = await poolSuper.query<{ n: string }>(
    `select coalesce(sum(
              case when a.recorrencia_tipo is null then 1
                   else (select count(*) from public.aviso_ocorrencias o
                          where o.aviso_id=a.id and o.status<>'pago') end
            ),0) as n
       from public.avisos a
      where a.status not in ('sem_aviso','pago','cancelado','recusado','expirado')
        and a.cobrador_id=$1`,
    [uid],
  )
  return Number(r.rows[0]!.n)
}

describe('E6/E8 recorrência (integração com whaviso_dev)', () => {
  let uid: string

  beforeAll(async () => {
    uid = await criarUsuario('Recorrencia Teste')
    await definirPlano(uid, 'profissional') // tem cadencia_configuravel + vagas
  })
  beforeEach(async () => {
    await poolSuper.query(`delete from public.avisos where cobrador_id=$1`, [uid])
  })
  afterAll(async () => {
    await limparUsuario(uid)
    await encerrarPools()
  })

  it('H6.10: criar recorrente por período (mensal x3) materializa 3 ocorrências (1ª = data combinada)', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: corpo({ recorrencia: { tipo: 'periodo', freq: 'mensal', intervalo: 1, ocorrencias: 3 } }),
    })
    await app.close()
    expect(r.statusCode).toBe(201)
    const aviso = r.json().aviso
    expect(aviso.recorrencia_tipo).toBe('periodo')
    expect(aviso.ocorrencias_total).toBe(3)
    expect(aviso.ocorrencia_atual).toBe(1)

    const ocs = await ocorrencias(aviso.id)
    expect(ocs.map((o) => o.data_combinada)).toEqual(['2026-12-10', '2027-01-10', '2027-02-10'])
    expect(ocs.every((o) => o.status === 'programado')).toBe(true)
  })

  it('H6.10: datas avulsas materializa a 1ª (data combinada) + as datas, dedup/ordenadas', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: corpo({ recorrencia: { tipo: 'avulsas', datas: ['2026-12-25', '2026-12-20'] } }),
    })
    await app.close()
    expect(r.statusCode).toBe(201)
    const ocs = await ocorrencias(r.json().aviso.id)
    expect(ocs.map((o) => o.data_combinada)).toEqual(['2026-12-10', '2026-12-20', '2026-12-25'])
  })

  it('H11.5: cada ocorrência reserva 1 vaga (SOMA = N, não 1 por combinado)', async () => {
    const app = await criarAppTeste(uid)
    await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: corpo({ recorrencia: { tipo: 'periodo', freq: 'mensal', intervalo: 1, ocorrencias: 4 } }),
    })
    await app.close()
    expect(await somarVagas(uid)).toBe(4) // 4 ocorrências não pagas = 4 vagas
  })

  it('H11.3: enviar recorrente além das vagas do plano → limite_plano_atingido (item não criado)', async () => {
    // Plano com poucas vagas: Start tem vagas = capacidade (100); para forçar o limite,
    // usamos um plano free? Free é somente_leitura. Usamos profissional (25 vagas) e um N
    // grande para estourar de uma vez.
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: corpo({ recorrencia: { tipo: 'periodo', freq: 'mensal', intervalo: 1, ocorrencias: 26 } }),
    })
    await app.close()
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('limite_plano_atingido')
    // Nada criado (a transação reverteu).
    const n = await poolSuper.query<{ n: string }>(
      `select count(*) as n from public.avisos where cobrador_id=$1`,
      [uid],
    )
    expect(Number(n.rows[0]!.n)).toBe(0)
  })

  it('H6.10: cadência personalizada SEM plano (start) → plano_sem_cadencia', async () => {
    const semCadencia = await criarUsuario('SemCadencia')
    await definirPlano(semCadencia, 'start') // start NÃO tem cadencia_configuravel
    const app = await criarAppTeste(semCadencia)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: corpo({ cadencia_etapas: ['d', 'd_mais_1'] }),
    })
    await app.close()
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('plano_sem_cadencia')
    await limparUsuario(semCadencia)
  })

  it('H6.10: cadência personalizada (Profissional) é gravada no aviso', async () => {
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: corpo({ cadencia_etapas: ['d_menos_1', 'd'] }),
    })
    await app.close()
    expect(r.statusCode).toBe(201)
    const row = await poolSuper.query<{ c: string[] }>(
      `select cadencia_etapas::text[] as c from public.avisos where id=$1`,
      [r.json().aviso.id],
    )
    expect(row.rows[0]!.c).toEqual(['d_menos_1', 'd'])
  })

  it('H8.7/H9.6: GET /avisos/:id/ocorrencias devolve o "k de N"; simples devolve []', async () => {
    const app = await criarAppTeste(uid)
    const rec = await app.inject({
      method: 'POST', url: '/v1/avisos', headers: AUTH,
      payload: corpo({ recorrencia: { tipo: 'periodo', freq: 'mensal', intervalo: 1, ocorrencias: 2 } }),
    })
    const simples = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpo() })

    const ocsRec = await app.inject({ method: 'GET', url: `/v1/avisos/${rec.json().aviso.id}/ocorrencias`, headers: AUTH })
    expect(ocsRec.statusCode).toBe(200)
    expect(ocsRec.json().length).toBe(2)
    expect(ocsRec.json()[0].indice).toBe(1)

    const ocsSimples = await app.inject({ method: 'GET', url: `/v1/avisos/${simples.json().aviso.id}/ocorrencias`, headers: AUTH })
    expect(ocsSimples.json()).toEqual([])
    await app.close()
  })

  it('H11.5: recorrência NÃO é gated por plano (free monta na agenda com ocorrências)', async () => {
    const free = await criarUsuario('FreeRecorrente') // nasce free
    const app = await criarAppTeste(free)
    const r = await app.inject({
      method: 'POST', url: '/v1/avisos', headers: AUTH,
      payload: corpo({ modo: 'agenda', recorrencia: { tipo: 'periodo', freq: 'mensal', intervalo: 1, ocorrencias: 3 } }),
    })
    await app.close()
    // Free PODE montar recorrente na agenda (sem_aviso): recorrência é facilitador, não gated.
    expect(r.statusCode).toBe(201)
    expect(r.json().aviso.status).toBe('sem_aviso')
    const ocs = await ocorrencias(r.json().aviso.id)
    expect(ocs.length).toBe(3)
    await limparUsuario(free)
  })
})
