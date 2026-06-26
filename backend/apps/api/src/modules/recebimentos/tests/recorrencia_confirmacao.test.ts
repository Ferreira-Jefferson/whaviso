// E8 H8.7: confirmação POR OCORRÊNCIA de um combinado recorrente. Cobre: confirmar a
// ocorrência k<N avança o ponteiro, NÃO vira pago (volta a programado), gera o mini-ciclo
// da k+1 e fecha a ocorrência k (status pago + envios cancelados); confirmar a ÚLTIMA vira
// pago terminal; idempotência; mensagem ao devedor é a variante recorrente (não vira pago).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  criarAppTeste,
  criarUsuario,
  definirPlano,
  encerrarPools,
  limparUsuario,
  poolSuper,
} from '../../../../test/harness'

const AUTH = { authorization: 'Bearer cobrador' }

function corpoRecorrente(ocorrencias = 3) {
  return {
    direcao: 'receber',
    nome_devedor: 'Maria',
    telefone_devedor: '+5511988887777',
    motivo: 'mensalidade',
    valor_centavos: 9900,
    data_combinada: '2026-12-10',
    pix_chave: 'maria@pix.com',
    pix_titular: 'Maria Silva',
    pix_banco: 'Banco Exemplo',
    recorrencia: { tipo: 'periodo', freq: 'mensal', ocorrencias },
  }
}

async function statusAviso(id: string): Promise<string> {
  const r = await poolSuper.query<{ status: string }>(`select status from public.avisos where id=$1`, [id])
  return r.rows[0]!.status
}
async function ponteiro(id: string): Promise<number> {
  const r = await poolSuper.query<{ a: number }>(`select ocorrencia_atual as a from public.avisos where id=$1`, [id])
  return r.rows[0]!.a
}
async function statusOcorrencia(id: string, indice: number): Promise<string> {
  const r = await poolSuper.query<{ status: string }>(
    `select status from public.aviso_ocorrencias where aviso_id=$1 and indice=$2`, [id, indice])
  return r.rows[0]!.status
}
async function contarNotif(id: string, tipo: string): Promise<number> {
  const r = await poolSuper.query<{ n: string }>(
    `select count(*) as n from public.notificacoes_cobrador where aviso_id=$1 and tipo=$2 and status<>'cancelado'`,
    [id, tipo])
  return Number(r.rows[0]!.n)
}

/** Cria um recorrente "aceito" (programado) com o mini-ciclo da ocorrência 1, direto no banco. */
async function criarRecorrenteAceito(cobrador: string, ocorrencias = 3): Promise<string> {
  const app = await criarAppTeste(cobrador)
  const r = await app.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH, payload: corpoRecorrente(ocorrencias) })
  await app.close()
  const id = r.json().aviso.id
  // Aceite: programado + horário reservado + mini-ciclo da ocorrência 1 (com ocorrencia_id).
  await poolSuper.query(
    `update public.avisos set status='programado', aceito_em=now(),
            horario_reservado_seg=30000, horario_reservado_orig=30000 where id=$1`,
    [id],
  )
  const oc1 = await poolSuper.query<{ id: string }>(
    `select id from public.aviso_ocorrencias where aviso_id=$1 and indice=1`, [id])
  for (const etapa of ['d_menos_2', 'd_menos_1', 'd', 'd_mais_1'] as const) {
    await poolSuper.query(
      `insert into public.envios (aviso_id, ocorrencia_id, etapa, status, agendado_para)
       values ($1,$2,$3,'agendado', now() + interval '1 day')
       on conflict (ocorrencia_id, etapa) where ocorrencia_id is not null do nothing`,
      [id, oc1.rows[0]!.id, etapa],
    )
  }
  return id
}

describe('E8 recorrência: confirmação por ocorrência', () => {
  let cobrador: string

  beforeAll(async () => {
    cobrador = await criarUsuario('Cobrador Recorrente')
    await definirPlano(cobrador, 'profissional')
  })
  beforeEach(async () => {
    await poolSuper.query(`delete from public.avisos where cobrador_id=$1`, [cobrador])
  })
  afterAll(async () => {
    await limparUsuario(cobrador)
    await encerrarPools()
  })

  it('confirmar ocorrência 1 de 3 (marcar pago direto): avança ponteiro, NÃO vira pago, gera ciclo da 2', async () => {
    const id = await criarRecorrenteAceito(cobrador, 3)
    const app = await criarAppTeste(cobrador)
    const r = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/confirmar-recebimento`, headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(r.json().status).toBe('programado') // NÃO vira pago

    expect(await statusAviso(id)).toBe('programado')
    expect(await ponteiro(id)).toBe(2)
    expect(await statusOcorrencia(id, 1)).toBe('pago')
    expect(await statusOcorrencia(id, 2)).toBe('programado')

    // Envios da ocorrência 1 cancelados; mini-ciclo da ocorrência 2 gerado (com ocorrencia_id).
    const oc2 = await poolSuper.query<{ id: string }>(
      `select id from public.aviso_ocorrencias where aviso_id=$1 and indice=2`, [id])
    const envios2 = await poolSuper.query<{ n: string }>(
      `select count(*) as n from public.envios where ocorrencia_id=$1 and status='agendado'`, [oc2.rows[0]!.id])
    expect(Number(envios2.rows[0]!.n)).toBe(4)
    // Mensagem ao devedor é a variante recorrente, não o encerramento terminal.
    expect(await contarNotif(id, 'encerramento_recorrente')).toBe(1)
    expect(await contarNotif(id, 'encerramento')).toBe(0)
  })

  it('confirmar a ÚLTIMA ocorrência vira pago terminal', async () => {
    const id = await criarRecorrenteAceito(cobrador, 2)
    const app = await criarAppTeste(cobrador)
    // Confirma a 1 (avança para 2, programado).
    await app.inject({ method: 'POST', url: `/v1/avisos/${id}/confirmar-recebimento`, headers: AUTH })
    expect(await statusAviso(id)).toBe('programado')
    expect(await ponteiro(id)).toBe(2)
    // Confirma a 2 (última): pago terminal.
    const r2 = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/confirmar-recebimento`, headers: AUTH })
    await app.close()
    expect(r2.json().status).toBe('pago')
    expect(await statusAviso(id)).toBe('pago')
    expect(await statusOcorrencia(id, 2)).toBe('pago')
    // Encerramento TERMINAL (não a variante recorrente) ao confirmar a última.
    expect(await contarNotif(id, 'encerramento')).toBe(1)
  })

  it('devedor informa pago numa ocorrência intermediária: aviso + ocorrência viram informado_pago; confirmar avança', async () => {
    const devedor = await criarUsuario('Devedor Recorrente')
    const id = await criarRecorrenteAceito(cobrador, 3)
    await poolSuper.query(`update public.avisos set devedor_profile_id=$2 where id=$1`, [id, devedor])

    const appD = await criarAppTeste(devedor)
    const inf = await appD.inject({ method: 'POST', url: `/v1/avisos/${id}/marcar-pago-devedor`, headers: { authorization: 'Bearer d' } })
    await appD.close()
    expect(inf.json().status).toBe('informado_pago')
    expect(await statusOcorrencia(id, 1)).toBe('informado_pago')

    // Cobrador confirma: ocorrência 1 fecha, aviso volta a programado para a ocorrência 2.
    const appC = await criarAppTeste(cobrador)
    const conf = await appC.inject({ method: 'POST', url: `/v1/avisos/${id}/confirmar-recebimento`, headers: AUTH })
    await appC.close()
    expect(conf.json().status).toBe('programado')
    expect(await ponteiro(id)).toBe(2)
    expect(await statusOcorrencia(id, 1)).toBe('pago')
    await limparUsuario(devedor)
  })

  it('rejeitar a ocorrência corrente: volta a programado, re-arma o ciclo da ocorrência (não vira pago)', async () => {
    const devedor = await criarUsuario('Devedor Rejeita')
    const id = await criarRecorrenteAceito(cobrador, 3)
    await poolSuper.query(`update public.avisos set devedor_profile_id=$2 where id=$1`, [id, devedor])
    // Devedor informa pago (ocorrência 1 -> informado_pago).
    const appD = await criarAppTeste(devedor)
    await appD.inject({ method: 'POST', url: `/v1/avisos/${id}/marcar-pago-devedor`, headers: { authorization: 'Bearer d' } })
    await appD.close()
    // Cobrador rejeita: ocorrência corrente (1) volta ao ciclo; ponteiro NÃO avança.
    const appC = await criarAppTeste(cobrador)
    const rej = await appC.inject({ method: 'POST', url: `/v1/avisos/${id}/rejeitar-pagamento`, headers: AUTH })
    await appC.close()
    expect(rej.json().status).toBe('programado')
    expect(await ponteiro(id)).toBe(1)
    expect(await statusAviso(id)).toBe('programado')
    await limparUsuario(devedor)
  })

  it('idempotência: confirmar de novo após pago terminal não duplica nem reverte', async () => {
    const id = await criarRecorrenteAceito(cobrador, 2)
    const app = await criarAppTeste(cobrador)
    await app.inject({ method: 'POST', url: `/v1/avisos/${id}/confirmar-recebimento`, headers: AUTH }) // 1 -> avança
    const rUlt = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/confirmar-recebimento`, headers: AUTH }) // 2 -> pago
    expect(rUlt.json().status).toBe('pago')
    const rDup = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/confirmar-recebimento`, headers: AUTH }) // idempotente
    await app.close()
    expect(rDup.json().status).toBe('pago')
    expect(await statusOcorrencia(id, 2)).toBe('pago')
    expect(await contarNotif(id, 'encerramento')).toBe(1) // não duplicou
  })
})
