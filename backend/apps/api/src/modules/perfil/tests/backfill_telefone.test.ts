import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  criarAppTeste,
  criarUsuario,
  encerrarPools,
  limparUsuario,
  poolSuper,
} from '../../../../test/harness'

const AUTH = { authorization: 'Bearer u' }

// Backfill por telefone: ao salvar o telefone no PATCH /perfil, a conta "puxa" os
// avisos abertos por esse número (vínculo por telefone, criados sem conta), em ambos
// os papéis. Espelha os índices parciais idx_avisos_tel_*_sem_perfil (migration 0017).
describe('perfil: backfill de avisos por telefone (PATCH /perfil)', () => {
  let criador: string // dono que abre os avisos (cobrador no receber, devedor no invertido)
  let novato: string // entra com o telefone e deve "puxar" os avisos
  const TEL = '+5511970001122'

  // Cria um aviso direto no banco (super), simulando convite por telefone sem conta.
  async function inserirAviso(over: Record<string, unknown>): Promise<string> {
    const base: Record<string, unknown> = {
      criador_papel: 'cobrador',
      cobrador_id: criador,
      devedor_profile_id: null,
      nome_devedor: 'Convidada',
      telefone_devedor: null,
      nome_cobrador: 'Criador',
      telefone_cobrador: null,
      direcao: 'receber',
      motivo: 'mensalidade',
      valor_centavos: 5000,
      data_combinada: '2026-12-20',
      status: 'programado',
      pix_chave: 'cobrador@pix.com', // Pix obrigatório no receber (E2)
      ...over,
    }
    const cols = Object.keys(base)
    const vals = Object.values(base)
    const ph = cols.map((_, i) => `$${i + 1}`).join(', ')
    const { rows } = await poolSuper.query(
      `insert into public.avisos (${cols.join(', ')}) values (${ph}) returning id`,
      vals,
    )
    return rows[0].id
  }

  async function patchTelefone(uid: string, telefone: string) {
    // Simula posse do telefone verificada via OTP: insere identidade phone em auth.identities
    // (o PATCH /perfil só faz backfill quando usuario_tem_identidade_phone retorna true).
    await poolSuper.query(
      `insert into auth.identities (id, user_id, provider) values ($1, $2, 'phone')
       on conflict (provider, id) do nothing`,
      [telefone, uid],
    )
    const app = await criarAppTeste(uid)
    const r = await app.inject({ method: 'PATCH', url: '/v1/perfil', headers: AUTH, payload: { telefone } })
    await app.close()
    return r
  }

  beforeAll(async () => {
    criador = await criarUsuario('Criador')
    novato = await criarUsuario('Novato')
  })
  beforeEach(async () => {
    await poolSuper.query('delete from public.avisos where cobrador_id = $1 or devedor_profile_id = $1', [criador])
  })
  afterAll(async () => {
    await limparUsuario(criador)
    await limparUsuario(novato)
    await encerrarPools()
  })

  it('puxa o aviso onde sou o devedor (telefone_devedor) ao salvar o telefone', async () => {
    const id = await inserirAviso({ telefone_devedor: TEL })
    const r = await patchTelefone(novato, TEL)
    expect(r.statusCode).toBe(200)
    const a = await poolSuper.query('select devedor_profile_id from public.avisos where id=$1', [id])
    expect(a.rows[0].devedor_profile_id).toBe(novato)
  })

  it('puxa o aviso onde fui convidado como cobrador (telefone_cobrador, invertido)', async () => {
    const id = await inserirAviso({
      criador_papel: 'devedor',
      direcao: 'pagar',
      cobrador_id: null,
      devedor_profile_id: criador,
      telefone_cobrador: TEL,
    })
    const r = await patchTelefone(novato, TEL)
    expect(r.statusCode).toBe(200)
    const a = await poolSuper.query('select cobrador_id from public.avisos where id=$1', [id])
    expect(a.rows[0].cobrador_id).toBe(novato)
  })

  it('não rouba aviso já vinculado a outra conta (slot não-nulo é preservado)', async () => {
    const id = await inserirAviso({ telefone_devedor: TEL, devedor_profile_id: criador })
    await patchTelefone(novato, TEL)
    const a = await poolSuper.query('select devedor_profile_id from public.avisos where id=$1', [id])
    expect(a.rows[0].devedor_profile_id).toBe(criador)
  })

  it('telefone que não bate com nenhum aviso não vincula nada', async () => {
    const id = await inserirAviso({ telefone_devedor: '+5511900000000' })
    await patchTelefone(novato, TEL)
    const a = await poolSuper.query('select devedor_profile_id from public.avisos where id=$1', [id])
    expect(a.rows[0].devedor_profile_id).toBeNull()
  })
})
