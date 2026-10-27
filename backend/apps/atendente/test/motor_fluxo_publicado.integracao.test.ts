// Integracao da onda 5 (P1 wiring): o motor DIRIGE a conversa pela versao PUBLICADA do fluxo da loja
// (builder visual), lida ao vivo do banco sob o role whaviso_atendente. Prova: sem publicacao cai no
// FLUXO_PADRAO; com publicacao, a saudacao personalizada do grafo vale; uma nova publicacao passa a
// valer em conversa nova, mas a conversa ja fixada termina na versao em que comecou; loja pausada (G7)
// nao cria nem avanca pedido e informa o cliente. Sem LLM, sem rede.
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { criarLogger, type Logger } from '@whaviso/shared/logger'
import { FLUXO_PADRAO, type FluxoGrafo } from '@whaviso/shared/contracts'
import { criarRegistry, processarProximaMensagem, type DepsMotor } from '../src/modules/motor_fluxo'
import { limparCacheFluxo } from '../src/modules/motor_fluxo/fluxo_fonte'
import { EstadoFluxo } from '../src/modules/motor_fluxo/tipos'
import {
  bancoAcessivel, contexto, fecharPools, inserirEntrada, lerEnvios, lerPedidos, limpar, semear, setContexto,
  poolAtendente, poolSuper, type Cenario,
} from './db'

const online = await bancoAcessivel()
const logger: Logger = criarLogger('atendente-teste', 'silent')
const registry = criarRegistry()

function deps(conversaId: string): DepsMotor {
  return { pool: poolAtendente, logger, registry, conversaId }
}

/** Grafo = FLUXO_PADRAO com a saudacao personalizada (unica alavanca de config dirigida no P1). */
function grafoComSaudacao(mensagem: string): FluxoGrafo {
  return {
    ...FLUXO_PADRAO,
    nodes: FLUXO_PADRAO.nodes.map((n) => (n.tipo === 'saudacao' ? { ...n, config: { mensagem } } : n)),
  }
}

/** Publica uma versao do fluxo da loja: garante o fluxo ativo, arquiva a publicada atual e publica. */
async function publicarFluxo(lojaId: string, grafo: FluxoGrafo): Promise<string> {
  const fluxo = await poolSuper.query(
    `insert into public.fluxos (loja_id, nome, ativo) values ($1, 'Fluxo', true)
       on conflict do nothing returning id`,
    [lojaId],
  )
  const fluxoId: string = fluxo.rows[0]?.id
    ?? (await poolSuper.query('select id from public.fluxos where loja_id = $1 limit 1', [lojaId])).rows[0].id
  // Uma publicada por fluxo: arquiva a anterior antes de publicar a nova.
  await poolSuper.query(`update public.fluxo_versoes set status = 'arquivada' where fluxo_id = $1 and status = 'publicada'`, [fluxoId])
  const prox = (await poolSuper.query('select coalesce(max(versao), 0) + 1 as v from public.fluxo_versoes where fluxo_id = $1', [fluxoId])).rows[0].v
  const r = await poolSuper.query(
    `insert into public.fluxo_versoes (fluxo_id, loja_id, versao, status, grafo, publicada_em)
     values ($1, $2, $3, 'publicada', $4::jsonb, now()) returning id`,
    [fluxoId, lojaId, prox, JSON.stringify(grafo)],
  )
  return r.rows[0].id as string
}

async function pausar(lojaId: string, ate: Date | null = null): Promise<void> {
  await poolSuper.query('update public.lojas set pausada = true, pausada_ate = $2 where id = $1', [lojaId, ate])
}

/**
 * Nova conversa com cliente novo (so ha uma conversa aberta por numero+cliente). Serve para provar que
 * publicacao nova so vale em conversa nova.
 */
async function novaConversa(c: Cenario): Promise<string> {
  const hash = createHash('sha256').update(randomUUID()).digest('hex')
  const cliente = await poolSuper.query(
    'insert into public.clientes (loja_id, telefone_hash, nome) values ($1, $2, $3) returning id',
    [c.lojaId, hash, 'Cliente Dois'],
  )
  const r = await poolSuper.query(
    `insert into public.conversas (loja_id, numero_whatsapp_id, cliente_id, status, contexto, ultima_entrada_em)
     values ($1, $2, $3, 'ia', '{}'::jsonb, now()) returning id`,
    [c.lojaId, c.numeroId, cliente.rows[0].id],
  )
  return r.rows[0].id as string
}

async function saudar(conversaId: string, lojaId: string): Promise<string> {
  const r = await poolSuper.query(
    `insert into public.mensagens (loja_id, conversa_id, direcao, autor, tipo, conteudo)
     values ($1, $2, 'entrada', 'cliente', 'texto'::tipo_mensagem, 'oi') returning id`,
    [lojaId, conversaId],
  )
  expect(await processarProximaMensagem(deps(conversaId))).toBe('processada')
  return r.rows[0].id as string
}

async function primeiroTexto(conversaId: string): Promise<string> {
  const envios = await lerEnvios(conversaId)
  const payload = envios[0]?.payload as { texto?: string } | undefined
  return payload?.texto ?? ''
}

const cenarios: string[] = []
async function novoCenario(): Promise<Cenario> {
  const c = await semear()
  cenarios.push(c.contaId)
  return c
}

afterEach(async () => {
  limparCacheFluxo()
  while (cenarios.length) await limpar(cenarios.pop()!)
})
afterAll(fecharPools)

describe.skipIf(!online)('motor_fluxo: versao publicada dirige o motor (P1 wiring)', () => {
  it('sem fluxo publicado: cai no FLUXO_PADRAO e fixa a versao como `padrao`', async () => {
    const c = await novoCenario()
    await saudar(c.conversaId, c.lojaId)

    expect(await primeiroTexto(c.conversaId)).toContain('Bem-vindo a Loja teste') // saudacao padrao
    expect((await contexto(c.conversaId))['fluxo_versao_id']).toBe('padrao')
  })

  it('com fluxo publicado: a saudacao personalizada do grafo dirige o turno e a versao e fixada', async () => {
    const c = await novoCenario()
    const msg = 'Boas-vindas! Monte seu pedido por aqui. Escolha uma categoria:'
    const versaoId = await publicarFluxo(c.lojaId, grafoComSaudacao(msg))

    await saudar(c.conversaId, c.lojaId)

    const texto = await primeiroTexto(c.conversaId)
    expect(texto).toContain(msg) // veio do grafo publicado
    expect(texto).not.toContain('Bem-vindo a Loja teste') // nao e o padrao
    expect((await contexto(c.conversaId))['fluxo_versao_id']).toBe(versaoId)
  })

  it('nova publicacao vale em conversa nova; conversa ja fixada termina na versao em que comecou', async () => {
    const c = await novoCenario()
    const v1 = await publicarFluxo(c.lojaId, grafoComSaudacao('Saudacao da versao um. Escolha:'))

    // Conversa 1 inicia na v1 e fixa v1.
    await saudar(c.conversaId, c.lojaId)
    expect(await primeiroTexto(c.conversaId)).toContain('versao um')
    expect((await contexto(c.conversaId))['fluxo_versao_id']).toBe(v1)

    // Publica v2 (arquiva v1).
    const v2 = await publicarFluxo(c.lojaId, grafoComSaudacao('Saudacao da versao dois. Escolha:'))

    // Conversa NOVA adota a v2.
    const conv2 = await novaConversa(c)
    await saudar(conv2, c.lojaId)
    expect(await primeiroTexto(conv2)).toContain('versao dois')
    expect((await contexto(conv2))['fluxo_versao_id']).toBe(v2)

    // Conversa 1, de volta a saudacao mas FIXADA em v1, continua na v1 (nao adota a v2).
    await setContexto(c.conversaId, EstadoFluxo.parse({ etapa: 'saudacao', fluxo_versao_id: v1 }))
    await saudar(c.conversaId, c.lojaId)
    const textos = (await lerEnvios(c.conversaId)).map((e) => (e.payload as { texto?: string }).texto ?? '')
    expect(textos.at(-1)).toContain('versao um')
    expect((await contexto(c.conversaId))['fluxo_versao_id']).toBe(v1)
  })
})

describe.skipIf(!online)('motor_fluxo: loja pausada (G7) nao aceita nem avanca pedido', () => {
  it('na saudacao: informa pausa, nao abre pedido, mantem a etapa e fixa a versao', async () => {
    const c = await novoCenario()
    await pausar(c.lojaId)

    await saudar(c.conversaId, c.lojaId)

    expect(await primeiroTexto(c.conversaId)).toContain('pausados')
    expect(await lerPedidos(c.lojaId)).toHaveLength(0)
    const ctx = await contexto(c.conversaId)
    expect(ctx['etapa']).toBe('saudacao') // nao avancou para pedir_categoria
    expect(ctx['fluxo_versao_id']).toBe('padrao')
  })

  it('no pagamento (conversa em andamento): nao cria pedido, informa pausa, mantem a etapa', async () => {
    const c = await novoCenario()
    await setContexto(
      c.conversaId,
      EstadoFluxo.parse({
        etapa: 'pagamento', pagamento: 'pix', endereco_id: c.enderecoId,
        carrinho: [{ item_id: c.cardapio.burger, quantidade: 1, opcoes_ids: [c.cardapio.grande] }],
      }),
    )
    await pausar(c.lojaId)

    const msgId = await inserirEntrada(c, 'interativo', 'pag:pix')
    expect(await processarProximaMensagem(deps(c.conversaId))).toBe('processada')

    expect(await lerPedidos(c.lojaId)).toHaveLength(0) // pausada: nenhum pedido criado
    const ctx = await contexto(c.conversaId)
    expect(ctx['etapa']).toBe('pagamento') // nao avancou para acompanhar
    const textos = (await lerEnvios(c.conversaId)).map((e) => (e.payload as { texto?: string }).texto ?? '')
    expect(textos.join(' ')).toContain('pausados')
    expect(msgId).toBeTruthy()
  })

  it('pausa com prazo ja vencido nao bloqueia (pausada_ate no passado)', async () => {
    const c = await novoCenario()
    await pausar(c.lojaId, new Date(Date.now() - 60_000)) // ja expirou

    await saudar(c.conversaId, c.lojaId)

    expect(await primeiroTexto(c.conversaId)).toContain('Bem-vindo a Loja teste') // saudacao normal
    expect((await contexto(c.conversaId))['etapa']).toBe('pedir_categoria') // avancou normalmente
  })

  it('acompanhar (leitura pura) segue respondendo mesmo com a loja pausada', async () => {
    const c = await novoCenario()
    await setContexto(c.conversaId, EstadoFluxo.parse({ etapa: 'acompanhar', fluxo_versao_id: 'padrao' }))
    await pausar(c.lojaId)

    const id = randomUUID()
    await poolSuper.query(
      `insert into public.mensagens (id, loja_id, conversa_id, direcao, autor, tipo, conteudo)
       values ($1, $2, $3, 'entrada', 'cliente', 'texto'::tipo_mensagem, 'cade meu pedido')`,
      [id, c.lojaId, c.conversaId],
    )
    expect(await processarProximaMensagem(deps(c.conversaId))).toBe('processada')

    const textos = (await lerEnvios(c.conversaId)).map((e) => (e.payload as { texto?: string }).texto ?? '')
    expect(textos.join(' ')).toContain('Nao encontrei um pedido') // acompanhar respondeu, nao a pausa
    expect(textos.join(' ')).not.toContain('pausados')
  })
})
