import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { criarAppTeste, criarUsuario, encerrarPools, limparUsuario, poolSuper } from '../../../../test/harness'

const AUTH = { authorization: 'Bearer x' }

// Estado da config singleton (id=1) usada pelo endpoint para montar o recibo. Só este
// arquivo mexe na config_plataforma (workspaces rodam em sequência), então setar/limpar
// aqui é seguro. A config nasce VAZIA pela migration 0059.
async function limparConfigPix(): Promise<void> {
  await poolSuper.query(
    `update public.config_plataforma
        set pix_tipo=null, pix_chave=null, pix_titular=null, pix_banco=null, pix_comentario=null
      where id=1`,
  )
}
async function definirConfigPix(): Promise<void> {
  await poolSuper.query(
    `update public.config_plataforma
        set pix_tipo='aleatoria', pix_chave='chave-teste-123', pix_titular='Whaviso', pix_banco='Banco X'
      where id=1`,
  )
}
async function definirTelefone(uid: string, tel: string | null): Promise<void> {
  await poolSuper.query(`update public.profiles set telefone=$2 where id=$1`, [uid, tel])
}
async function linhasBilling(uid: string) {
  const { rows } = await poolSuper.query<{
    telefone_alvo: string
    quantidade: number
    valor_centavos: number
    status: string
  }>(
    `select telefone_alvo, quantidade, valor_centavos, status
       from public.notificacoes_billing where profile_id=$1 order by criado_em`,
    [uid],
  )
  return rows
}

describe('billing recarga (integração)', () => {
  let u: string

  beforeAll(async () => {
    u = await criarUsuario('Recarga')
    await limparConfigPix()
  })
  afterAll(async () => {
    await limparUsuario(u)
    await limparConfigPix()
    await encerrarPools()
  })

  it('sem telefone no perfil: recusa com telefone_ausente e NÃO enfileira', async () => {
    await definirTelefone(u, null)
    const app = await criarAppTeste(u)
    const r = await app.inject({ method: 'POST', url: '/v1/billing/recarga', headers: AUTH, payload: { quantidade: 50 } })
    await app.close()
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('telefone_ausente')
    expect(await linhasBilling(u)).toHaveLength(0)
  })

  it('com telefone mas sem chave Pix configurada: recusa com pix_nao_configurado', async () => {
    await definirTelefone(u, '+5511988887777')
    await limparConfigPix()
    const app = await criarAppTeste(u)
    const r = await app.inject({ method: 'POST', url: '/v1/billing/recarga', headers: AUTH, payload: { quantidade: 50 } })
    await app.close()
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('pix_nao_configurado')
    expect(await linhasBilling(u)).toHaveLength(0)
  })

  it('quantidade fora da faixa do catálogo: recusa com quantidade_invalida', async () => {
    await definirTelefone(u, '+5511988887777')
    await definirConfigPix()
    const app = await criarAppTeste(u)
    const r = await app.inject({ method: 'POST', url: '/v1/billing/recarga', headers: AUTH, payload: { quantidade: 5 } })
    await app.close()
    expect(r.statusCode).toBe(422)
    expect(r.json().error.code).toBe('quantidade_invalida')
    expect(await linhasBilling(u)).toHaveLength(0)
  })

  it('com telefone e chave Pix: enfileira com a quantidade e o valor da curva (não credita)', async () => {
    await definirTelefone(u, '+5511988887777')
    await definirConfigPix()
    const app = await criarAppTeste(u)
    const r = await app.inject({ method: 'POST', url: '/v1/billing/recarga', headers: AUTH, payload: { quantidade: 50 } })
    await app.close()
    expect(r.statusCode).toBe(200)
    // Curva em 50 envios = 90 centavos/envio (migration 0058) -> 50 * 90 = 4500.
    expect(r.json()).toEqual({ enfileirado: true, quantidade: 50, valor_centavos: 4500 })

    const linhas = await linhasBilling(u)
    expect(linhas).toHaveLength(1)
    expect(linhas[0]).toMatchObject({
      telefone_alvo: '+5511988887777',
      quantidade: 50,
      valor_centavos: 4500,
      status: 'agendado',
    })

    // Charge-on-success: a recarga NÃO credita saldo (o owner credita após o pagamento).
    const { rows } = await poolSuper.query<{ saldo_livre: number }>(
      `select saldo_livre from public.creditos_carteira where profile_id=$1`,
      [u],
    )
    expect(rows[0]!.saldo_livre).toBe(5) // só a cortesia inicial
  })

  it('exige autenticação (401 sem token)', async () => {
    const app = await criarAppTeste(u)
    const r = await app.inject({ method: 'POST', url: '/v1/billing/recarga', payload: { quantidade: 50 } })
    await app.close()
    expect(r.statusCode).toBe(401)
  })
})
