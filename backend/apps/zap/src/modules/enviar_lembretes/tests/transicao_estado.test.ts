// Máquina de estados do aviso (F-STATE): valida o trigger validar_transicao_aviso
// (defesa em profundidade no banco). Insere o aviso DIRETO no estado de origem (o
// trigger só dispara em UPDATE of status, então o INSERT não é barrado) e tenta a
// transição via UPDATE como superusuário. Aceitas devem passar; inválidas devem
// estourar 'transicao de status invalida' (errcode check_violation).
import { afterAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { poolSuper, encerrarPools } from '../../../../test/harness'

afterAll(async () => {
  await encerrarPools()
})

// Cria um aviso direto no estado `origem` e devolve o id (limpa o cobrador no fim).
async function semearAviso(origem: string): Promise<{ id: string; cobradorId: string }> {
  const cobradorId = randomUUID()
  await poolSuper.query(`insert into auth.users (id) values ($1)`, [cobradorId])
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.avisos
       (cobrador_id, direcao, criador_papel, status, nome_devedor, telefone_devedor,
        motivo, valor_centavos, data_combinada, pix_chave)
     values ($1,'receber','cobrador',$2,'Maria','+5511999990000','mensalidade',9900,'2026-12-15','cobrador@pix.com')
     returning id`,
    [cobradorId, origem],
  )
  return { id: rows[0]!.id, cobradorId }
}

async function tentar(origem: string, destino: string): Promise<{ ok: boolean; status: string }> {
  const { id, cobradorId } = await semearAviso(origem)
  try {
    await poolSuper.query(`update public.avisos set status=$2 where id=$1`, [id, destino])
    const { rows } = await poolSuper.query<{ status: string }>(
      `select status from public.avisos where id=$1`,
      [id],
    )
    return { ok: true, status: rows[0]!.status }
  } catch {
    return { ok: false, status: origem }
  } finally {
    await poolSuper.query(`delete from auth.users where id=$1`, [cobradorId])
  }
}

describe('validar_transicao_aviso: transições ACEITAS', () => {
  const aceitas: Array<[string, string]> = [
    ['sem_aviso', 'aguardando_aceite'],
    ['sem_aviso', 'cancelado'],
    ['sem_aviso', 'pago'],
    ['aguardando_aceite', 'programado'],
    ['aguardando_aceite', 'cancelado'],
    ['aguardando_aceite', 'expirado'],
    ['aguardando_aceite', 'recusado'],
    ['programado', 'informado_pago'],
    ['programado', 'pago'],
    ['programado', 'cancelado'],
    ['programado', 'expirado'],
    ['programado', 'pausado'],
    ['programado', 'aguardando_aprovacao_aviso_editado'],
    ['programado', 'desregistrado'],
    ['informado_pago', 'pago'],
    ['informado_pago', 'programado'],
    ['informado_pago', 'cancelado'],
    ['informado_pago', 'expirado'],
    ['pago', 'programado'], // reabertura (E8 H8.6)
    ['pausado', 'programado'],
    ['pausado', 'cancelado'],
    ['pausado', 'expirado'],
    ['aguardando_aprovacao_aviso_editado', 'programado'],
    ['aguardando_aprovacao_aviso_editado', 'cancelado'],
    ['aguardando_aprovacao_aviso_editado', 'expirado'],
    ['desregistrado', 'programado'],
    ['desregistrado', 'cancelado'],
    ['desregistrado', 'expirado'],
  ]
  for (const [origem, destino] of aceitas) {
    it(`${origem} -> ${destino} é aceita`, async () => {
      const r = await tentar(origem, destino)
      expect(r.ok).toBe(true)
      expect(r.status).toBe(destino)
    })
  }
})

describe('validar_transicao_aviso: transições REJEITADAS', () => {
  const rejeitadas: Array<[string, string]> = [
    ['recusado', 'programado'], // terminal não sai
    ['recusado', 'cancelado'],
    ['cancelado', 'programado'], // terminal não sai
    ['expirado', 'programado'], // terminal não sai
    ['pago', 'cancelado'], // pago só reabre (->programado)
    ['pago', 'informado_pago'],
    ['aguardando_aceite', 'pago'], // convite não vira pago direto
    ['aguardando_aceite', 'informado_pago'],
    ['programado', 'aguardando_aceite'], // não volta ao convite
    ['programado', 'sem_aviso'],
    ['pausado', 'pago'], // suspenso não vira terminal de pagamento direto
    ['desregistrado', 'pago'],
    ['informado_pago', 'pausado'],
  ]
  for (const [origem, destino] of rejeitadas) {
    it(`${origem} -> ${destino} é rejeitada`, async () => {
      const r = await tentar(origem, destino)
      expect(r.ok).toBe(false)
      expect(r.status).toBe(origem)
    })
  }
})
