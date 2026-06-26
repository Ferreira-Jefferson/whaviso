import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { processarNotificacoesBilling } from '../index'
import { clienteWhatsFake, encerrarPools, limpar, poolSuper, poolZap } from '../../../../test/harness'

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never

// Só este arquivo mexe na config_plataforma no workspace do zap (workspaces rodam em
// sequência), então setar/limpar aqui é seguro.
async function definirConfigPix(): Promise<void> {
  await poolSuper.query(
    `update public.config_plataforma
        set pix_tipo='aleatoria', pix_chave='chave-teste-123', pix_titular='Whaviso', pix_banco='Banco X'
      where id=1`,
  )
}
async function limparConfigPix(): Promise<void> {
  await poolSuper.query(
    `update public.config_plataforma
        set pix_tipo=null, pix_chave=null, pix_titular=null, pix_banco=null, pix_comentario=null
      where id=1`,
  )
}
function ativarTemplate(ativo: boolean): Promise<unknown> {
  return poolSuper.query(
    `update public.templates
        set ativo=$1, status_meta=(case when $1 then 'aprovado' else 'pendente' end)::status_meta_template
      where chave='billing.recarga'`,
    [ativo],
  )
}

async function criarProfile(): Promise<string> {
  const id = randomUUID()
  await poolSuper.query(`insert into auth.users (id) values ($1)`, [id])
  await poolSuper.query(`update public.profiles set nome='Recarga' where id=$1`, [id])
  return id
}
async function enfileirarBilling(
  profileId: string,
  telefone: string,
  quantidade: number,
  valorCentavos: number,
): Promise<string> {
  const { rows } = await poolSuper.query<{ id: string }>(
    `insert into public.notificacoes_billing (profile_id, telefone_alvo, quantidade, valor_centavos)
     values ($1,$2,$3,$4) returning id`,
    [profileId, telefone, quantidade, valorCentavos],
  )
  return rows[0]!.id
}
async function lerBilling(id: string) {
  const { rows } = await poolSuper.query<{
    status: string
    wamid: string | null
    erro: string | null
    tentativas: number
    proxima: Date | null
  }>(
    `select status, wamid, erro, tentativas, proxima_tentativa_em as proxima
       from public.notificacoes_billing where id=$1`,
    [id],
  )
  return rows[0]!
}

describe('notificar_billing: empurra a mensagem de compra de crédito (H11.10)', () => {
  beforeEach(async () => {
    await ativarTemplate(true)
    await definirConfigPix()
  })
  afterAll(async () => {
    await ativarTemplate(true) // o seed deixa ativa
    await limparConfigPix()
    await encerrarPools()
  })

  it('envia ao telefone do usuário com a quantidade, o valor e a chave Pix da plataforma', async () => {
    const uid = await criarProfile()
    const id = await enfileirarBilling(uid, '+5511988887777', 50, 4500)
    let destino = ''
    let texto = ''
    const whats = clienteWhatsFake((m) => {
      destino = m.para
      texto = m.texto
      return { wamid: 'w_recarga' }
    })

    const n = await processarNotificacoesBilling({ pool: poolZap, logger, whats })
    expect(n).toBe(1)
    expect(destino).toBe('+5511988887777')
    expect(texto).toContain('50') // quantidade
    expect(texto).toContain('45,00') // valor formatado (formatarValorBr)
    expect(texto).toContain('chave-teste-123') // chave Pix da plataforma

    const linha = await lerBilling(id)
    expect(linha.status).toBe('enviado')
    expect(linha.wamid).toBe('w_recarga')
    expect(linha.erro).toBeNull()
    await limpar(uid)
  })

  it('GATED: sem chave Pix configurada, não envia e devolve a agendado com erro recuperável', async () => {
    const uid = await criarProfile()
    const id = await enfileirarBilling(uid, '+5511988887777', 50, 4500)
    await limparConfigPix()
    const whats = clienteWhatsFake(() => ({ wamid: 'nao_deveria' }))

    const n = await processarNotificacoesBilling({ pool: poolZap, logger, whats })
    expect(n).toBe(0)
    expect(whats.enviadas).toHaveLength(0)
    const linha = await lerBilling(id)
    expect(linha.status).toBe('agendado')
    expect(linha.erro).toBe('pix_nao_configurado')
    expect(linha.tentativas).toBe(0) // não conta como falha
    await limpar(uid)
  })

  it('GATED: sem template ativo, não envia; ao ativar, a mesma linha drena e envia', async () => {
    const uid = await criarProfile()
    const id = await enfileirarBilling(uid, '+5511988887777', 50, 4500)
    await ativarTemplate(false)
    const whats = clienteWhatsFake(() => ({ wamid: 'w_redrain' }))

    let n = await processarNotificacoesBilling({ pool: poolZap, logger, whats })
    expect(n).toBe(0)
    expect((await lerBilling(id)).erro).toBe('sem_template_ativo')

    await ativarTemplate(true)
    n = await processarNotificacoesBilling({ pool: poolZap, logger, whats })
    expect(n).toBe(1)
    const linha = await lerBilling(id)
    expect(linha.status).toBe('enviado')
    expect(linha.wamid).toBe('w_redrain')
    expect(linha.erro).toBeNull()
    await limpar(uid)
  })

  it('falha transitória reagenda (20-60s) e esgota em 3 tentativas, ficando falho visível', async () => {
    const uid = await criarProfile()
    const id = await enfileirarBilling(uid, '+5511988887777', 50, 4500)
    const whats = clienteWhatsFake(() => {
      throw new Error('rede caiu')
    })

    await processarNotificacoesBilling({ pool: poolZap, logger, whats })
    let linha = await lerBilling(id)
    expect(linha.status).toBe('agendado')
    expect(linha.tentativas).toBe(1)
    const espera = (linha.proxima!.getTime() - Date.now()) / 1000
    expect(espera).toBeGreaterThanOrEqual(15)
    expect(espera).toBeLessThanOrEqual(65)

    await poolSuper.query(`update public.notificacoes_billing set proxima_tentativa_em=null where id=$1`, [id])
    await processarNotificacoesBilling({ pool: poolZap, logger, whats })
    expect((await lerBilling(id)).tentativas).toBe(2)

    await poolSuper.query(`update public.notificacoes_billing set proxima_tentativa_em=null where id=$1`, [id])
    await processarNotificacoesBilling({ pool: poolZap, logger, whats })
    linha = await lerBilling(id)
    expect(linha.status).toBe('falhou')
    expect(linha.tentativas).toBe(3)
    await limpar(uid)
  })
})
