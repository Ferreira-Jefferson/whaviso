// Orquestra um turno do motor deterministico, numa transacao:
//   1. reivindica a proxima mensagem de entrada (claim FOR UPDATE SKIP LOCKED) e trava a conversa
//      (serializa o turno por conversa);
//   2. conversa em handoff humano ('humano') ou encerrada: NAO responde, so marca processada;
//   3. senao monta o contexto (loja/cliente/cardapio vivo/estado), roda o node da etapa atual,
//      efetiva os efeitos (estado, endereco, pedido, handoff, encerrar), enfileira as respostas em
//      `envios` e registra as mensagens de saida, e marca a entrada processada.
// SEM LLM. NUNCA loga telefone nem conteudo (so ids, etapa e desfecho).
import { comTransacao, notificar, type Pool, type PoolClient } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import { SaidaNode, type MensagemProposta, type NodeContext, type NodeRegistry } from '@whaviso/shared/contracts'
import { texto } from './acoes'
import { montarContexto, type ContextoTurno } from './contexto'
import { aplicarEfeitos } from './efeitos'
import { claimMensagem, lockConversa } from './repo_leitura'
import * as escrita from './repo_escrita'
import { ETAPA_INICIAL } from './tipos'

export type Desfecho = 'processada' | 'suprimida' | 'descartada' | 'vazio'

export interface DepsMotor {
  pool: Pool
  logger: Logger
  registry: NodeRegistry
  /** relogio injetavel (testes). */
  agora?: () => Date
  /** restringe o claim a uma conversa (testes/drain direcionado); omitido = global. */
  conversaId?: string
}

/** Processa no maximo UMA mensagem de entrada. Devolve o desfecho. */
export async function processarProximaMensagem(deps: DepsMotor): Promise<Desfecho> {
  const agora = deps.agora?.() ?? new Date()
  return comTransacao(deps.pool, async (tx: PoolClient) => {
    const claim = await claimMensagem(tx, deps.conversaId)
    if (!claim) return 'vazio'

    const conversa = await lockConversa(tx, claim.conversa_id)
    if (!conversa) {
      await escrita.marcarProcessada(tx, claim.id)
      return 'descartada'
    }

    // Handoff humano ou conversa encerrada: o motor nao responde (so consome a mensagem).
    if (conversa.status !== 'ia') {
      await escrita.marcarProcessada(tx, claim.id)
      deps.logger.info({ conversa_id: conversa.id, status: conversa.status }, 'turno suprimido')
      return 'suprimida'
    }

    const ctx = await montarContexto(tx, claim, conversa, agora)
    if (!ctx) {
      await escrita.marcarProcessada(tx, claim.id)
      return 'descartada'
    }

    // Backstop anti-poison: erro inesperado no turno NAO pode abortar a transacao sem consumir a
    // mensagem (senao a fila global trava neste inbound). Desfaz so o turno (savepoint), consome a
    // mensagem e passa a conversa para um humano, para o cliente nao ficar sem resposta.
    await tx.query('savepoint sp_turno')
    try {
      await rodarTurno(deps, tx, ctx, claim.id)
    } catch (erro) {
      await tx.query('rollback to savepoint sp_turno')
      deps.logger.error({ conversa_id: ctx.conversaId, err: erro }, 'turno falhou: consumindo mensagem e acionando humano')
      await degradarFalha(tx, ctx, claim.id)
    }
    return 'processada'
  })
}

/** Falha inesperada no turno: avisa o cliente, passa para humano e marca a mensagem processada. */
async function degradarFalha(tx: PoolClient, ctx: ContextoTurno, mensagemId: string): Promise<void> {
  const corpo = 'Tivemos um problema tecnico ao processar seu pedido. Vou te passar para uma pessoa da loja.'
  await escrita.inserirMensagemSaida(tx, { lojaId: ctx.lojaId, conversaId: ctx.conversaId, tipo: 'texto', conteudo: corpo })
  await escrita.enfileirarEnvio(tx, {
    lojaId: ctx.lojaId, numeroId: ctx.numeroId, clienteId: ctx.clienteId, destinatarioHash: ctx.destinatarioHash,
    conversaId: ctx.conversaId, payload: texto(corpo), dedupeChave: `${mensagemId}:falha`,
  })
  await escrita.marcarHumano(tx, ctx.conversaId)
  await notificar(tx, {
    tipo: 'conversa.handoff', loja_id: ctx.lojaId,
    payload: { conversa_id: ctx.conversaId, loja_id: ctx.lojaId, status: 'humano' },
  })
  await escrita.marcarProcessada(tx, mensagemId)
}

async function rodarTurno(deps: DepsMotor, tx: PoolClient, ctx: ContextoTurno, mensagemId: string): Promise<void> {
  const { entrada } = ctx
  const node = deps.registry.get(entrada.estado.etapa) ?? deps.registry.get(ETAPA_INICIAL)
  if (!node) throw new Error('registry sem node inicial')

  const nodeCtx: NodeContext = { loja_id: ctx.lojaId, conversa_id: ctx.conversaId }
  const bruta = await node.executar(entrada, node.configSchema.parse({}), nodeCtx)
  const saida = SaidaNode.parse(bruta)

  const resultado = await aplicarEfeitos(
    {
      tx,
      lojaId: ctx.lojaId,
      conversaId: ctx.conversaId,
      numeroId: ctx.numeroId,
      clienteId: ctx.clienteId,
      destinatarioHash: ctx.destinatarioHash,
      cardapio: entrada.cardapio,
      agora: entrada.agora,
    },
    entrada.estado,
    saida.efeitos,
  )

  await escrita.salvarContexto(tx, ctx.conversaId, resultado.estado)

  if (resultado.encerrar) {
    await escrita.encerrarConversa(tx, ctx.conversaId)
  } else if (resultado.handoff) {
    await escrita.marcarHumano(tx, ctx.conversaId)
    await notificar(tx, {
      tipo: 'conversa.handoff',
      loja_id: ctx.lojaId,
      payload: { conversa_id: ctx.conversaId, loja_id: ctx.lojaId, status: 'humano' },
    })
  }

  const mensagens = [...saida.mensagens, ...resultado.mensagensExtra]
  for (let i = 0; i < mensagens.length; i++) {
    await enfileirar(tx, ctx, mensagens[i]!, `${mensagemId}:${i}`)
  }
  await escrita.marcarProcessada(tx, mensagemId)
  deps.logger.info(
    { conversa_id: ctx.conversaId, etapa_ate: resultado.estado.etapa, respostas: mensagens.length },
    'turno processado',
  )
}

/** Registra a mensagem de saida no log da conversa e enfileira na outbox (texto/interativo). */
async function enfileirar(tx: PoolClient, ctx: ContextoTurno, msg: MensagemProposta, dedupe: string): Promise<void> {
  const tipo = msg.tipo === 'interativo' ? 'interativo' : 'texto'
  const conteudo = msg.tipo === 'template' ? msg.template : msg.texto
  await escrita.inserirMensagemSaida(tx, { lojaId: ctx.lojaId, conversaId: ctx.conversaId, tipo, conteudo })
  await escrita.enfileirarEnvio(tx, {
    lojaId: ctx.lojaId,
    numeroId: ctx.numeroId,
    clienteId: ctx.clienteId,
    destinatarioHash: ctx.destinatarioHash,
    conversaId: ctx.conversaId,
    payload: msg,
    dedupeChave: dedupe,
  })
}

/** Drena o inbound: processa ate `max` mensagens ou ate nao haver mais pendentes. */
export async function drenarInbound(deps: DepsMotor, max = 50): Promise<{ processadas: number; suprimidas: number }> {
  let processadas = 0
  let suprimidas = 0
  for (let i = 0; i < max; i++) {
    const desfecho = await processarProximaMensagem(deps)
    if (desfecho === 'vazio') break
    if (desfecho === 'processada') processadas += 1
    else if (desfecho === 'suprimida') suprimidas += 1
  }
  return { processadas, suprimidas }
}
