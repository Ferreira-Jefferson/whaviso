import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  aceitarAvisoDireto,
  criarAppTeste,
  criarUsuario,
  definirPlano,
  encerrarPools,
  limparAvisos,
  limparUsuario,
  poolSuper,
} from '../../../../test/harness'

// E8 (Confirmação de pagamento): confirma/marca-direto/rejeita/reabre + janela de 1min
// (encerramento ao devedor via outbox generalizada) + reengajamento pós-ciclo.
const AUTH_COBRADOR = { authorization: 'Bearer cobrador' }
const AUTH_DEVEDOR = { authorization: 'Bearer devedor' }

function corpo(over: Record<string, unknown> = {}) {
  return {
    direcao: 'receber',
    nome_devedor: 'Maria',
    telefone_devedor: '+5511999998888',
    motivo: 'mensalidade',
    itens: [{ descricao: 'Item', qtd: 1, valor_unit_centavos: 9900 }],
    data_combinada: '2026-12-15',
    pix_chave: 'maria@pix.com',
    pix_titular: 'Maria Silva',
    pix_banco: 'Banco Exemplo',
    ...over,
  }
}

describe('recebimentos E8: confirmação, marcar direto, reabrir, reengajar', () => {
  let cobrador: string
  let devedor: string

  async function criar(over: Record<string, unknown> = {}): Promise<string> {
    const appC = await criarAppTeste(cobrador)
    const criado = await appC.inject({ method: 'POST', url: '/v1/avisos', headers: AUTH_COBRADOR, payload: corpo(over) })
    await appC.close()
    const body = criado.json()
    await aceitarAvisoDireto(body.aviso.id, devedor)
    return body.aviso.id
  }

  async function devedorInforma(id: string): Promise<void> {
    const app = await criarAppTeste(devedor)
    await app.inject({ method: 'POST', url: `/v1/avisos/${id}/marcar-pago-devedor`, headers: AUTH_DEVEDOR })
    await app.close()
  }

  async function post(id: string, acao: string, auth = AUTH_COBRADOR) {
    const app = await criarAppTeste(cobrador)
    const r = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/${acao}`, headers: auth })
    await app.close()
    return r
  }

  async function contarNotif(id: string, tipo: string, status?: string): Promise<number> {
    const sql = status
      ? `select count(*)::int as n from public.notificacoes_cobrador where aviso_id=$1 and tipo=$2 and status=$3`
      : `select count(*)::int as n from public.notificacoes_cobrador where aviso_id=$1 and tipo=$2`
    const params = status ? [id, tipo, status] : [id, tipo]
    const { rows } = await poolSuper.query(sql, params)
    return rows[0].n
  }

  beforeAll(async () => {
    cobrador = await criarUsuario('Cobrador E8')
    await definirPlano(cobrador, 'profissional')
    devedor = await criarUsuario('Devedor E8')
  })
  beforeEach(async () => {
    await limparAvisos(cobrador)
  })
  afterAll(async () => {
    await limparUsuario(cobrador)
    await limparUsuario(devedor)
    await encerrarPools()
  })

  // H8.1 -------------------------------------------------------------------------------
  it('confirma de informado_pago: evento confirmado_cobrador + encerramento agendado ~1min', async () => {
    const id = await criar()
    await devedorInforma(id)
    const r = await post(id, 'confirmar-recebimento')
    expect(r.statusCode).toBe(200)
    expect(r.json().status).toBe('pago')

    // Evento de confirmação grava o ator CONCRETO (id do cobrador) em detalhes (B2).
    const ev = await poolSuper.query(
      `select detalhes from public.eventos_aviso where aviso_id=$1 and tipo='confirmado_cobrador'`, [id])
    expect(ev.rowCount).toBe(1)
    expect(ev.rows[0].detalhes.cobrador_id).toBe(cobrador)

    // Encerramento ao devedor: agendado ~1min no futuro (janela de reversão), SEM sair já.
    const enc = await poolSuper.query(
      `select agendar_para > now() + interval '30 seconds' as futuro
         from public.notificacoes_cobrador where aviso_id=$1 and tipo='encerramento' and status='agendado'`, [id])
    expect(enc.rowCount).toBe(1)
    expect(enc.rows[0].futuro).toBe(true)
  })

  it('idempotente: confirmar de novo um já-pago não muda nada nem duplica evento', async () => {
    const id = await criar()
    await devedorInforma(id)
    await post(id, 'confirmar-recebimento')
    const r2 = await post(id, 'confirmar-recebimento')
    expect(r2.json().status).toBe('pago')
    const ev = await poolSuper.query(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='confirmado_cobrador'`, [id])
    expect(ev.rows[0].n).toBe(1)
  })

  // H8.4 -------------------------------------------------------------------------------
  it('marcar pago DIRETO de programado: evento marcado_pago_cobrador (distingue do informado)', async () => {
    const id = await criar()
    const r = await post(id, 'confirmar-recebimento') // de 'programado' direto
    expect(r.json().status).toBe('pago')
    const ev = await poolSuper.query(
      `select detalhes from public.eventos_aviso where aviso_id=$1 and tipo='marcado_pago_cobrador'`, [id])
    expect(ev.rowCount).toBe(1)
    expect(ev.rows[0].detalhes.cobrador_id).toBe(cobrador)
    // Não gravou 'confirmado_cobrador' (não veio de informado_pago).
    const c = await poolSuper.query(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='confirmado_cobrador'`, [id])
    expect(c.rows[0].n).toBe(0)
  })

  // H8.2 -------------------------------------------------------------------------------
  it('rejeitar: volta a programado, evento rejeitado_cobrador + notifica devedor (rejeicao)', async () => {
    const id = await criar()
    await devedorInforma(id)
    const r = await post(id, 'rejeitar-pagamento')
    expect(r.json().status).toBe('programado')
    const ev = await poolSuper.query(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='rejeitado_cobrador'`, [id])
    expect(ev.rows[0].n).toBe(1)
    expect(await contarNotif(id, 'rejeicao')).toBe(1)
    // Catch-up: as 4 etapas voltam a agendado (horário não mudou).
    const env = await poolSuper.query(
      `select count(*)::int as n from public.envios where aviso_id=$1 and status='agendado'`, [id])
    expect(env.rows[0].n).toBe(4)
  })

  // H8.6 reabrir + janela de 1min ------------------------------------------------------
  it('reabrir DENTRO do minuto: cancela o encerramento (devedor não recebe nada)', async () => {
    const id = await criar()
    await devedorInforma(id)
    await post(id, 'confirmar-recebimento')
    // O encerramento está agendado (futuro). Reabre antes de sair.
    const r = await post(id, 'desmarcar-recebimento')
    expect(r.json().status).toBe('programado')
    // O encerramento foi cancelado (coalescido): nenhum agendado/processando sobra.
    expect(await contarNotif(id, 'encerramento', 'agendado')).toBe(0)
    expect(await contarNotif(id, 'encerramento', 'cancelado')).toBe(1)
    // E NÃO enfileira status_alterado (a confirmação e a reabertura se anulam).
    expect(await contarNotif(id, 'status_alterado')).toBe(0)
    // Evento de reabertura distinto (reaberto_cobrador), com ator concreto.
    const ev = await poolSuper.query(
      `select detalhes from public.eventos_aviso where aviso_id=$1 and tipo='reaberto_cobrador'`, [id])
    expect(ev.rowCount).toBe(1)
    expect(ev.rows[0].detalhes.cobrador_id).toBe(cobrador)
  })

  it('reabrir DEPOIS de o encerramento sair: enfileira status_alterado', async () => {
    const id = await criar()
    await devedorInforma(id)
    await post(id, 'confirmar-recebimento')
    // Simula o encerramento JÁ ENVIADO (drainer): marca a linha como enviada.
    await poolSuper.query(
      `update public.notificacoes_cobrador set status='enviado', enviado_em=now() where aviso_id=$1 and tipo='encerramento'`, [id])
    const r = await post(id, 'desmarcar-recebimento')
    expect(r.json().status).toBe('programado')
    // Como nada pendente foi anulado, manda a 2a mensagem "status alterado".
    expect(await contarNotif(id, 'status_alterado')).toBe(1)
  })

  it('múltiplas reaberturas preservam o horário original (_orig nunca vira null, M3)', async () => {
    const id = await criar()
    // Aloca um horário reservado (simula o aceite real).
    await poolSuper.query(
      `update public.avisos set horario_reservado_seg=30000, horario_reservado_orig=30000 where id=$1`, [id])
    await post(id, 'confirmar-recebimento') // pago: trigger libera _seg, preserva _orig=30000
    let row = await poolSuper.query(
      `select horario_reservado_seg as seg, horario_reservado_orig as orig from public.avisos where id=$1`, [id])
    expect(row.rows[0].seg).toBeNull()
    expect(row.rows[0].orig).toBe(30000)
    await post(id, 'desmarcar-recebimento') // reabre: reusa _orig=30000
    row = await poolSuper.query(
      `select horario_reservado_seg as seg, horario_reservado_orig as orig from public.avisos where id=$1`, [id])
    expect(row.rows[0].seg).toBe(30000)
    expect(row.rows[0].orig).toBe(30000)
    // 2a rodada: confirma e reabre de novo; _orig segue 30000.
    await post(id, 'confirmar-recebimento')
    await post(id, 'desmarcar-recebimento')
    row = await poolSuper.query(
      `select horario_reservado_seg as seg, horario_reservado_orig as orig from public.avisos where id=$1`, [id])
    expect(row.rows[0].seg).toBe(30000)
    expect(row.rows[0].orig).toBe(30000)
  })

  it('reabrir é a única saída de pago; só o cobrador (devedor → 403)', async () => {
    const id = await criar()
    await post(id, 'confirmar-recebimento')
    const app = await criarAppTeste(devedor)
    const r = await app.inject({ method: 'POST', url: `/v1/avisos/${id}/desmarcar-recebimento`, headers: AUTH_DEVEDOR })
    await app.close()
    expect(r.statusCode).toBe(403)
  })

  // H8.3 reengajamento -----------------------------------------------------------------
  it('reengajar só após D+1: ciclo em andamento → 409 ciclo_em_andamento', async () => {
    const id = await criar({ data_combinada: '2099-12-15' }) // data futura: ciclo em andamento
    const r = await post(id, 'reengajar')
    expect(r.statusCode).toBe(409)
    expect(r.json().error.code).toBe('ciclo_em_andamento')
  })

  it('reengajar pós-ciclo: enfileira reengajamento + evento, sem mudar estado', async () => {
    const id = await criar({ data_combinada: '2020-01-10' }) // muito no passado: pós-ciclo
    const r = await post(id, 'reengajar')
    expect(r.statusCode).toBe(200)
    expect(r.json().status).toBe('programado') // não muda de estado
    expect(await contarNotif(id, 'reengajamento')).toBe(1)
    const ev = await poolSuper.query(
      `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo='reengajamento_cobrador'`, [id])
    expect(ev.rows[0].n).toBe(1)
  })

  it('reengajar: limite nunca 2 no mesmo dia (C5)', async () => {
    const id = await criar({ data_combinada: '2020-01-10' })
    const r1 = await post(id, 'reengajar')
    expect(r1.statusCode).toBe(200)
    const r2 = await post(id, 'reengajar')
    expect(r2.statusCode).toBe(422)
    expect(r2.json().error.code).toBe('reengajamento_hoje')
  })

  it('reengajar: respeita o teto reengajamento_max do plano por combinado (C5)', async () => {
    const id = await criar({ data_combinada: '2020-01-10' })
    // Simula 3 reengajamentos já feitos em dias passados (teto profissional = 3).
    for (let i = 0; i < 3; i++) {
      await poolSuper.query(
        `insert into public.eventos_aviso (aviso_id, tipo, ator, criado_em)
         values ($1,'reengajamento_cobrador','cobrador', now() - interval '5 days' - ($2 || ' days')::interval)`,
        [id, String(i)])
    }
    const r = await post(id, 'reengajar')
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('reengajamento_limite')
  })

  // H8.9 transições inválidas ----------------------------------------------------------
  it('confirmar de um estado inválido (cancelado) → 409 estado_invalido', async () => {
    const id = await criar()
    await poolSuper.query(`update public.avisos set status='cancelado' where id=$1`, [id])
    const r = await post(id, 'confirmar-recebimento')
    expect(r.statusCode).toBe(409)
    expect(r.json().error.code).toBe('estado_invalido')
  })

  // H8.7 recorrência (GATED) -----------------------------------------------------------
  it.todo('recorrência por ocorrência: confirma a ocorrência k sem encerrar o combinado (depende de H6.10)')
})
