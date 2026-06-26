// E6 H6.10 / E8 H8.7 / E11 H11.3/H11.4/H11.5: recorrência e cadência. Cobre: criar
// recorrente materializa N ocorrências; cada ocorrência RESERVA 1 crédito (SOMA = N, não 1
// por combinado); recorrente além do saldo é recusado (saldo_insuficiente); cadência é
// UNIVERSAL (liberada para todos); cadência filtra etapas no ciclo; a rota /ocorrencias
// expõe o "k de N". (A confirmação por ocorrência fica em recebimentos.)
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  creditarConta,
  criarAppTeste,
  criarUsuario,
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

/** Lê o balde RESERVADO da carteira (créditos presos a avisos ativos não disparados). */
async function reservado(uid: string): Promise<number> {
  const r = await poolSuper.query<{ reservado: number }>(
    `select reservado from public.creditos_carteira where profile_id=$1`,
    [uid],
  )
  return r.rows[0]?.reservado ?? 0
}

/** Reseta a carteira para um saldo conhecido entre testes (saldo alto, baldes zerados). */
async function resetarCarteira(uid: string, saldo: number): Promise<void> {
  await poolSuper.query(
    `update public.creditos_carteira
        set saldo_livre=$2, reservado=0, em_hold=0, consumido=0, ja_comprou=true where profile_id=$1`,
    [uid, saldo],
  )
}

describe('E6/E8 recorrência (integração com whaviso_dev)', () => {
  let uid: string

  beforeAll(async () => {
    uid = await criarUsuario('Recorrencia Teste')
    await creditarConta(uid, 1000)
  })
  beforeEach(async () => {
    await poolSuper.query(`delete from public.avisos where cobrador_id=$1`, [uid])
    // Reseta a carteira: os avisos foram deletados, mas o livro-razão é append-only; para o
    // saldo refletir "começar limpo", zera os baldes e devolve um saldo generoso.
    await resetarCarteira(uid, 1000)
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
      payload: corpo({ recorrencia: { tipo: 'periodo', freq: 'mensal', ocorrencias: 3 } }),
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

  it('H11.4: cada ocorrência reserva 1 crédito (SOMA = N, não 1 por combinado)', async () => {
    const app = await criarAppTeste(uid)
    await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: corpo({ recorrencia: { tipo: 'periodo', freq: 'mensal', ocorrencias: 4 } }),
    })
    await app.close()
    expect(await reservado(uid)).toBe(4) // 4 ocorrências = 4 créditos reservados
  })

  it('H11.4: enviar recorrente além do saldo → saldo_insuficiente (item não criado)', async () => {
    // Saldo exatamente 3; um recorrente de 4 ocorrências precisa de 4 -> recusa.
    await resetarCarteira(uid, 3)
    const app = await criarAppTeste(uid)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: corpo({ recorrencia: { tipo: 'periodo', freq: 'mensal', ocorrencias: 4 } }),
    })
    await app.close()
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('saldo_insuficiente')
    // Nada criado (a transação reverteu) e o saldo intacto.
    const n = await poolSuper.query<{ n: string }>(
      `select count(*) as n from public.avisos where cobrador_id=$1`,
      [uid],
    )
    expect(Number(n.rows[0]!.n)).toBe(0)
    expect(await reservado(uid)).toBe(0)
  })

  it('H11.2: cadência personalizada é UNIVERSAL (liberada para todos, qualquer saldo)', async () => {
    // Conta nova (só cortesia, nunca "comprou"): cadência personalizada passa (não há
    // gating por recurso); o único limite é o saldo (1 crédito reservado, cabe na cortesia).
    const qualquer = await criarUsuario('CadenciaUniversal')
    const app = await criarAppTeste(qualquer)
    const r = await app.inject({
      method: 'POST',
      url: '/v1/avisos',
      headers: AUTH,
      payload: corpo({ cadencia_etapas: ['d', 'd_mais_1'] }),
    })
    await app.close()
    expect(r.statusCode).toBe(201)
    await limparUsuario(qualquer)
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
      payload: corpo({ recorrencia: { tipo: 'periodo', freq: 'mensal', ocorrencias: 2 } }),
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
      payload: corpo({ modo: 'agenda', recorrencia: { tipo: 'periodo', freq: 'mensal', ocorrencias: 3 } }),
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
