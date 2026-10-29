// Integracao de ZAP-enviar contra o Postgres local (role whaviso_zap). Prova: claim
// FOR UPDATE SKIP LOCKED (exatamente-uma-vez sob contencao), recuperacao de orfaos, janela
// de 24h, retentativa com backoff, teto -> falhou, SEC-031 (coluna proibida barrada), SEC-070
// no caminho VIVO (cliente endurecido bloqueia redirect para IP interno) e saude do numero.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { Permanente, Transitorio, FakeClienteWhats, type ErroProvedor } from '@whaviso/shared/clientes'
import { criarLogger } from '@whaviso/shared/logger'
import { criarClienteWhatsMeta } from '../src/shared/meta_client'
import { drenarEnvios, type DepsDreno } from '../src/modules/enviar'
import {
  bancoAcessivel,
  cifra,
  enfileirarTexto,
  fecharPools,
  lerEnvio,
  limpar,
  poolSuper,
  poolZap,
  semear,
  statusNumero,
} from './db'

const online = await bancoAcessivel()
if (!online) console.warn('[ZAP-enviar] Postgres local inacessivel: integracao PULADA.')

const logger = criarLogger('teste-enviar', 'silent')
const contas: string[] = []

async function cenario(op?: Parameters<typeof semear>[0]) {
  const c = await semear(op)
  contas.push(c.contaId)
  return c
}

function deps(whats: DepsDreno['whats'], config?: DepsDreno['config']): DepsDreno {
  // aleatorio fixo deixa o backoff deterministico; config pequena forca contencao no claim.
  return { pool: poolZap, whats, cifra, logger, config, aleatorio: () => 0 }
}

// O claim do dreno e GLOBAL (qualquer loja). No banco compartilhado (whaviso_dev no CI), outras
// suites que rodam antes podem deixar linhas em `envios`; partimos de `envios` vazio para as
// asativas de contagem (`reivindicados: 1`) serem deterministicas em qualquer banco.
beforeAll(async () => {
  if (online) await poolSuper.query('delete from public.envios')
})
// Limpa os dados de cada teste logo apos ele: o claim do dreno e GLOBAL (qualquer loja), entao
// uma linha `agendado` deixada por um teste contaminaria o proximo.
afterEach(async () => {
  for (const id of contas) await limpar(id)
  contas.length = 0
})
afterAll(async () => {
  await fecharPools()
})

describe.skipIf(!online)('ZAP-enviar: dreno da outbox', () => {
  it('sucesso: grava status/wamid/enviado_em (so colunas de outbox, SEC-031)', async () => {
    const c = await cenario()
    const id = await enfileirarTexto(c, 'ola')
    const whats = new FakeClienteWhats()

    const resumo = await drenarEnvios(deps(whats))

    expect(resumo).toMatchObject({ reivindicados: 1, enviados: 1, falhas: 0, reagendados: 0 })
    const e = await lerEnvio(id)
    expect(e.status).toBe('enviado')
    expect(e.wamid).toMatch(/^wamid\.fake\./)
    expect(e.enviado_em).not.toBeNull()
    expect(e.erro).toBeNull()
    // Saiu pelo numero da propria linha (SEC-001/002): o fake recebeu o phoneNumberId do numero.
    expect(whats.chamadas[0]!.entrada).toMatchObject({ para: '+5511988887777' })
  })

  it('numero pausado: o envio NAO e reivindicado (fica retido ate reativar, nao martela a Meta)', async () => {
    const c = await cenario({ statusNumero: 'pausado' })
    const id = await enfileirarTexto(c, 'ola')
    const whats = new FakeClienteWhats()

    const resumo = await drenarEnvios(deps(whats))

    expect(resumo.reivindicados).toBe(0)
    expect(whats.chamadas.length).toBe(0)
    expect((await lerEnvio(id)).status).toBe('agendado')
  })

  it('claim SKIP LOCKED: dois workers concorrentes enviam cada item UMA vez', async () => {
    const c = await cenario()
    const total = 5
    for (let i = 0; i < total; i += 1) await enfileirarTexto(c, `m${i}`)
    const whats = new FakeClienteWhats()

    const worker = async () => {
      for (;;) {
        const r = await drenarEnvios(deps(whats, { tamanhoLote: 1 }))
        if (r.reivindicados === 0) break
      }
    }
    await Promise.all([worker(), worker()])

    // Cada envio foi despachado exatamente uma vez (nunca duas), com wamids distintos.
    expect(whats.chamadas).toHaveLength(total)
    const { rows } = await poolSuper.query<{ n: string }>(
      `select count(*)::text as n from public.envios where loja_id = $1 and status = 'enviado'`,
      [c.lojaId],
    )
    expect(Number(rows[0]!.n)).toBe(total)
    const wamids = new Set<string>()
    const todos = await poolSuper.query<{ wamid: string }>(
      'select wamid from public.envios where loja_id = $1',
      [c.lojaId],
    )
    for (const r of todos.rows) wamids.add(r.wamid)
    expect(wamids.size).toBe(total)
  })

  it('recuperacao de orfaos: processando antigo volta a agendado e e enviado', async () => {
    const c = await cenario()
    const antigo = new Date(Date.now() - 10 * 60_000)
    const id = await enfileirarTexto(c, 'orfao', { status: 'processando', atualizadoEm: antigo })

    const resumo = await drenarEnvios(deps(new FakeClienteWhats()))

    expect(resumo.orfaos).toBeGreaterThanOrEqual(1)
    expect((await lerEnvio(id)).status).toBe('enviado')
  })

  it('retentativa: erro transitorio reagenda com backoff e consome 1 tentativa', async () => {
    const c = await cenario()
    const id = await enfileirarTexto(c, 'retry')
    const whats = new FakeClienteWhats().falharSempre(new Transitorio())

    const resumo = await drenarEnvios(deps(whats, { maxTentativas: 4 }))

    expect(resumo).toMatchObject({ reagendados: 1, enviados: 0, falhas: 0 })
    const e = await lerEnvio(id)
    expect(e.status).toBe('agendado')
    expect(e.tentativas).toBe(1)
    expect(e.proxima_tentativa_em).not.toBeNull()
    expect(e.proxima_tentativa_em!.getTime()).toBeGreaterThan(Date.now())
    expect(e.erro).toBe('Transitorio:Transitorio')
  })

  it('teto de tentativas: transitorio no limite vira falhou', async () => {
    const c = await cenario()
    const id = await enfileirarTexto(c, 'teto', { tentativas: 1 })
    const whats = new FakeClienteWhats().falharSempre(new Transitorio())

    await drenarEnvios(deps(whats, { maxTentativas: 2 }))

    const e = await lerEnvio(id)
    expect(e.status).toBe('falhou')
    expect(e.tentativas).toBe(2)
  })

  it('janela de 24h: texto fora da janela falha permanente (fora_da_janela)', async () => {
    const c = await cenario({ ultimaEntrada: new Date(Date.now() - 25 * 60 * 60_000) })
    const id = await enfileirarTexto(c, 'tarde')

    await drenarEnvios(deps(new FakeClienteWhats()))

    const e = await lerEnvio(id)
    expect(e.status).toBe('falhou')
    expect(e.erro).toBe('JanelaExpirada:fora_da_janela')
  })

  it('credencial invalida: pausa a saude do numero e falha sem reenviar os outros', async () => {
    const c = await cenario()
    const id = await enfileirarTexto(c, 'cred')
    const erro: ErroProvedor = new Permanente('x', { codigo: 'credencial_invalida' })
    const whats = new FakeClienteWhats().falharSempre(erro)

    await drenarEnvios(deps(whats))

    expect((await lerEnvio(id)).status).toBe('falhou')
    expect(await statusNumero(c.numeroId)).toBe('pausado')
  })

  it('numero sem token: credencial invalida sem chamar a Meta', async () => {
    const c = await cenario({ token: null })
    const id = await enfileirarTexto(c, 'sem-token')
    const whats = new FakeClienteWhats()

    await drenarEnvios(deps(whats))

    expect(whats.chamadas).toHaveLength(0)
    const e = await lerEnvio(id)
    expect(e.status).toBe('falhou')
    expect(e.erro).toContain('credencial_invalida')
    expect(await statusNumero(c.numeroId)).toBe('pausado')
  })

  it('SEC-070 no caminho VIVO: cliente endurecido bloqueia redirect para IP interno', async () => {
    const c = await cenario()
    const id = await enfileirarTexto(c, 'ssrf')
    // fetch que redireciona para rede link-local (metadata); DNS do host sempre publico.
    const fetchImpl = (async () =>
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } })) as typeof fetch
    const whats = criarClienteWhatsMeta({
      appSecret: 'segredo',
      fetchImpl,
      resolverDns: async () => ['93.184.216.34'],
    })

    await drenarEnvios(deps(whats))

    const e = await lerEnvio(id)
    expect(e.status).toBe('falhou')
    expect(e.erro).toContain('ssrf_bloqueado')
    // SEC-024: o erro gravado nao carrega o token do numero.
    expect(e.erro).not.toContain('EAAG')
  })

  it('coerencia de tenant: envio com cliente de OUTRA loja NAO e reivindicado nem enviado', async () => {
    // Loja A (a dona do envio e do numero) e loja B (dona do cliente). Uma linha de outbox com
    // loja_id/numero de A mas cliente_id de B e inconsistente: nunca pode decifrar o telefone de B
    // e manda-lo pelo numero de A. Defesa em profundidade contra um bug de autorizacao na api.
    const a = await cenario()
    const b = await cenario()
    const cruzado = await enfileirarTexto(a, 'cruzado', { clienteId: b.clienteId })
    const legitimo = await enfileirarTexto(a, 'ok')
    const whats = new FakeClienteWhats()

    const resumo = await drenarEnvios(deps(whats))

    // So o envio coerente e reivindicado/enviado; o cruzado nao sai e fica retido em `agendado`.
    expect(resumo).toMatchObject({ reivindicados: 1, enviados: 1 })
    expect(whats.chamadas).toHaveLength(1)
    expect((await lerEnvio(cruzado)).status).toBe('agendado')
    expect((await lerEnvio(legitimo)).status).toBe('enviado')
  })

  it('SEC-031: whaviso_zap NAO escreve coluna fora do outbox (loja_id)', async () => {
    const c = await cenario()
    const id = await enfileirarTexto(c, 'rbac')
    await expect(
      poolZap.query('update public.envios set loja_id = $1 where id = $2', [c.lojaId, id]),
    ).rejects.toThrow()
  })
})
