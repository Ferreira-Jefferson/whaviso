// Detecção de mudança por versão (plano de cache do front): GET /sync/versao devolve um
// carimbo barato que só avança quando algo muda de verdade no escopo do usuário (avisos
// ou aviso_ocorrencias dele), isolado por profile.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { criarAppTeste, criarUsuario, encerrarPools, limparUsuario, poolSuper } from '../../../../test/harness'

const AUTH = { authorization: 'Bearer u' }

async function criarAviso(cobradorId: string, telefoneDevedor: string): Promise<string> {
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.avisos
       (cobrador_id, direcao, criador_papel, status, nome_devedor, telefone_devedor,
        pix_chave, motivo, valor_centavos, data_combinada)
     values ($1,'receber','cobrador','programado',$2,$3,'c@pix.com','pedido',10000,'2026-07-01')
     returning id`,
    [cobradorId, 'Devedor', telefoneDevedor],
  )
  return rows[0]!.id
}

/** Aviso onde o usuário do escopo é o DEVEDOR (cobrador_id é de outra conta). */
async function criarAvisoComDevedor(
  cobradorId: string,
  devedorProfileId: string,
  telefoneDevedor: string,
): Promise<string> {
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.avisos
       (cobrador_id, devedor_profile_id, direcao, criador_papel, status, nome_devedor,
        telefone_devedor, pix_chave, motivo, valor_centavos, data_combinada)
     values ($1,$2,'receber','cobrador','programado',$3,$4,'c@pix.com','pedido',10000,'2026-07-01')
     returning id`,
    [cobradorId, devedorProfileId, 'Devedor', telefoneDevedor],
  )
  return rows[0]!.id
}

async function criarEnvio(avisoId: string): Promise<string> {
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.envios (aviso_id, etapa, status, agendado_para)
     values ($1,'d_menos_2','agendado', now() + interval '1 day')
     returning id`,
    [avisoId],
  )
  return rows[0]!.id
}

describe('sync: GET /sync/versao', () => {
  let userA: string
  let userB: string

  async function appA() {
    return criarAppTeste(userA)
  }

  beforeAll(async () => {
    userA = await criarUsuario('Cobradora A')
    userB = await criarUsuario('Cobradora B')
  })
  beforeEach(async () => {
    await poolSuper.query('delete from public.avisos where cobrador_id = any($1)', [[userA, userB]])
  })
  afterAll(async () => {
    await limparUsuario(userA)
    await limparUsuario(userB)
    await encerrarPools()
  })

  it('sem token → 401', async () => {
    const app = await appA()
    const r = await app.inject({ method: 'GET', url: '/v1/sync/versao' })
    await app.close()
    expect(r.statusCode).toBe(401)
  })

  it('sem nenhum aviso, devolve a época (versão mínima)', async () => {
    const app = await appA()
    const r = await app.inject({ method: 'GET', url: '/v1/sync/versao', headers: AUTH })
    await app.close()
    expect(r.statusCode).toBe(200)
    expect(new Date(r.json().versao).getTime()).toBe(new Date('1970-01-01T00:00:00Z').getTime())
  })

  it('avança quando um aviso do usuário muda; repetir sem mudar mantém a mesma versão', async () => {
    await criarAviso(userA, '+5511900002001')

    const app1 = await appA()
    const r1 = await app1.inject({ method: 'GET', url: '/v1/sync/versao', headers: AUTH })
    await app1.close()
    const v1 = r1.json().versao

    const app2 = await appA()
    const r2 = await app2.inject({ method: 'GET', url: '/v1/sync/versao', headers: AUTH })
    await app2.close()
    expect(r2.json().versao).toBe(v1)

    // Muda o estado de um aviso do usuário: o trigger de atualizado_em avança a versão.
    await poolSuper.query(`update public.avisos set status = 'pago' where cobrador_id = $1`, [userA])

    const app3 = await appA()
    const r3 = await app3.inject({ method: 'GET', url: '/v1/sync/versao', headers: AUTH })
    await app3.close()
    expect(new Date(r3.json().versao).getTime()).toBeGreaterThan(new Date(v1).getTime())
  })

  it('avança quando uma OCORRÊNCIA do usuário muda (não só o aviso-pai)', async () => {
    const avisoId = await criarAviso(userA, '+5511900002002')
    await poolSuper.query(
      `insert into public.aviso_ocorrencias (aviso_id, indice, data_combinada, status)
       values ($1, 1, '2026-07-01', 'programado')`,
      [avisoId],
    )

    const app1 = await appA()
    const r1 = await app1.inject({ method: 'GET', url: '/v1/sync/versao', headers: AUTH })
    await app1.close()
    const v1 = r1.json().versao

    await poolSuper.query(`update public.aviso_ocorrencias set status = 'pago' where aviso_id = $1`, [avisoId])

    const app2 = await appA()
    const r2 = await app2.inject({ method: 'GET', url: '/v1/sync/versao', headers: AUTH })
    await app2.close()
    expect(new Date(r2.json().versao).getTime()).toBeGreaterThan(new Date(v1).getTime())
  })

  it('isolamento: mudança no aviso de A não avança a versão de B', async () => {
    await criarAviso(userB, '+5511900002003')

    const app1 = await appA()
    const r1 = await app1.inject({ method: 'GET', url: '/v1/sync/versao', headers: AUTH })
    await app1.close()
    const v1 = r1.json().versao

    await poolSuper.query(`update public.avisos set status = 'pago' where cobrador_id = $1`, [userB])

    const app2 = await appA()
    const r2 = await app2.inject({ method: 'GET', url: '/v1/sync/versao', headers: AUTH })
    await app2.close()
    expect(r2.json().versao).toBe(v1)
  })

  it('avança quando o zap atualiza entrega_status de um envio do usuário (gap: envios não tinha atualizado_em)', async () => {
    const avisoId = await criarAviso(userA, '+5511900002004')
    await criarEnvio(avisoId)

    const app1 = await appA()
    const r1 = await app1.inject({ method: 'GET', url: '/v1/sync/versao', headers: AUTH })
    await app1.close()
    const v1 = r1.json().versao

    // Simula o zap marcando a mensagem como lida (webhook_whatsapp/repo.ts atualizarEntrega).
    await poolSuper.query(
      `update public.envios set entrega_status = 'read' where aviso_id = $1`,
      [avisoId],
    )

    const app2 = await appA()
    const r2 = await app2.inject({ method: 'GET', url: '/v1/sync/versao', headers: AUTH })
    await app2.close()
    expect(new Date(r2.json().versao).getTime()).toBeGreaterThan(new Date(v1).getTime())
  })

  it('avança quando um evento (ex.: solicitou_pix) é inserido para um aviso do usuário (gap: eventos_aviso é append-only, sem atualizado_em)', async () => {
    const avisoId = await criarAviso(userA, '+5511900002005')

    const app1 = await appA()
    const r1 = await app1.inject({ method: 'GET', url: '/v1/sync/versao', headers: AUTH })
    await app1.close()
    const v1 = r1.json().versao

    await poolSuper.query(
      `insert into public.eventos_aviso (aviso_id, tipo, ator) values ($1,'solicitou_pix','devedor')`,
      [avisoId],
    )

    const app2 = await appA()
    const r2 = await app2.inject({ method: 'GET', url: '/v1/sync/versao', headers: AUTH })
    await app2.close()
    expect(new Date(r2.json().versao).getTime()).toBeGreaterThan(new Date(v1).getTime())
  })

  it('escopo devedor_profile_id: avança quando um aviso onde o usuário é DEVEDOR muda (nunca exercitado antes, só cobrador_id)', async () => {
    const avisoId = await criarAvisoComDevedor(userB, userA, '+5511900002006')

    const app1 = await appA()
    const r1 = await app1.inject({ method: 'GET', url: '/v1/sync/versao', headers: AUTH })
    await app1.close()
    const v1 = r1.json().versao

    await poolSuper.query(`update public.avisos set status = 'pago' where id = $1`, [avisoId])

    const app2 = await appA()
    const r2 = await app2.inject({ method: 'GET', url: '/v1/sync/versao', headers: AUTH })
    await app2.close()
    expect(new Date(r2.json().versao).getTime()).toBeGreaterThan(new Date(v1).getTime())
  })

  it('escopo devedor_profile_id: avança quando uma OCORRÊNCIA de um aviso onde o usuário é DEVEDOR muda', async () => {
    const avisoId = await criarAvisoComDevedor(userB, userA, '+5511900002007')
    await poolSuper.query(
      `insert into public.aviso_ocorrencias (aviso_id, indice, data_combinada, status)
       values ($1, 1, '2026-07-01', 'programado')`,
      [avisoId],
    )

    const app1 = await appA()
    const r1 = await app1.inject({ method: 'GET', url: '/v1/sync/versao', headers: AUTH })
    await app1.close()
    const v1 = r1.json().versao

    await poolSuper.query(`update public.aviso_ocorrencias set status = 'pago' where aviso_id = $1`, [avisoId])

    const app2 = await appA()
    const r2 = await app2.inject({ method: 'GET', url: '/v1/sync/versao', headers: AUTH })
    await app2.close()
    expect(new Date(r2.json().versao).getTime()).toBeGreaterThan(new Date(v1).getTime())
  })
})
