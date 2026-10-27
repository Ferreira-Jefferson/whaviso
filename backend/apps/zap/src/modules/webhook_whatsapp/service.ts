// Orquestra o inbound: para cada mensagem de entrada, uma transacao que reivindica o wamid
// (idempotencia), resolve a loja pelo phone_number_id, faz upsert do cliente por telefone
// (hash/cifra do kernel), garante a conversa, insere a mensagem, marca a janela de 24h e emite
// o evento realtime `conversa.mensagem` (referencia, SEM PII). Recibos de status atualizam o
// envio por wamid, fora de transacao (update idempotente). Trabalho fino: a interpretacao fica
// no atendente. NUNCA loga telefone, conteudo nem token (so ids/wamid e contadores).
import { comTransacao, notificar, type Pool, type PoolClient } from '@whaviso/shared/db'
import { extrairEventos, type MensagemEntrada, type PayloadWebhook, type ReciboStatus } from './parse'
import * as repo from './repo'
import type { DepsWebhook, ResumoWebhook } from './tipos'

type Desfecho = 'persistida' | 'duplicada' | 'descartada'

/** Processa uma mensagem de entrada numa transacao. Idempotente por wamid (SEC-051). */
async function processarMensagem(deps: DepsWebhook, m: MensagemEntrada): Promise<Desfecho> {
  const { cifra } = deps
  // Sem cifra nao da para hashear/cifrar o remetente: nao persiste (os recibos seguem). O
  // wamid NAO e reivindicado aqui, para a Meta reentregar quando a cifra voltar.
  if (!cifra) {
    deps.logger.warn('inbound sem MASTER_KEY: mensagem nao persistida (configure a cifra)')
    return 'descartada'
  }
  const e164 = cifra.normalizarTelefoneBR(m.telefone)
  if (!e164) {
    deps.logger.warn({ wamid: m.wamid }, 'inbound com telefone invalido: descartado')
    return 'descartada'
  }
  const telefoneHash = cifra.hashTelefone(e164)
  const telefoneCifrado = cifra.cifrar(Buffer.from(e164, 'utf8'))

  return comTransacao(deps.pool, async (tx: PoolClient) => {
    // 1) Reivindica o wamid ANTES de qualquer efeito: reentrega/replay nao duplica nada.
    const reivindicou = await repo.reivindicarWamid(tx, m.wamid)
    if (!reivindicou) return 'duplicada'

    // 2) Loja vem SO do phone_number_id resolvido no banco (SEC-001/002), nunca do payload.
    const numero = await repo.resolverNumero(tx, m.phoneNumberId)
    if (!numero || numero.status === 'removido') {
      deps.logger.warn({ wamid: m.wamid }, 'inbound de numero desconhecido ou removido: descartado')
      return 'descartada'
    }

    // 3) Cliente por (loja, telefone_hash); 4) conversa aberta; 5) mensagem; 6) janela de 24h.
    const clienteId = await repo.upsertCliente(tx, numero.loja_id, telefoneHash, telefoneCifrado)
    const conversa = await repo.resolverConversa(tx, numero.loja_id, numero.id, clienteId)
    await repo.inserirMensagemEntrada(tx, {
      lojaId: numero.loja_id,
      conversaId: conversa.id,
      tipo: m.tipo,
      conteudo: m.conteudo,
      midiaRef: m.midiaRef,
      wamid: m.wamid,
    })
    await repo.marcarUltimaEntrada(tx, conversa.id)

    // 7) Evento realtime so com referencia (ids/direcao/autor): o painel refaz a query. O NOTIFY
    // so sai no COMMIT (passamos o client da transacao). Handoff humano = regra do atendente;
    // aqui o painel precisa do sinal de que chegou mensagem, independente do status da conversa.
    await notificar(tx, {
      tipo: 'conversa.mensagem',
      loja_id: numero.loja_id,
      payload: {
        conversa_id: conversa.id,
        loja_id: numero.loja_id,
        direcao: 'entrada',
        autor: 'cliente',
      },
    })
    return 'persistida'
  })
}

/** Aplica um recibo de status ao envio correspondente (por wamid). Idempotente, sem transacao. */
async function processarRecibo(deps: DepsWebhook, pool: Pool, r: ReciboStatus): Promise<boolean> {
  const casou = await repo.aplicarRecibo(pool, r.wamid, r.status, r.erro)
  if (casou === 0) {
    deps.logger.debug({ wamid: r.wamid, status: r.status }, 'recibo de wamid desconhecido: ignorado')
    return false
  }
  return true
}

/**
 * Persiste um payload JA validado por assinatura. Cada item e isolado: a falha de um nao derruba
 * os outros (e a Meta reentrega o payload; os itens ja persistidos deduplicam). Retorna o resumo.
 */
export async function processarWebhook(deps: DepsWebhook, payload: PayloadWebhook): Promise<ResumoWebhook> {
  const { mensagens, statuses } = extrairEventos(payload)
  const resumo: ResumoWebhook = {
    mensagens: 0,
    duplicadas: 0,
    descartadas: 0,
    recibos: 0,
    recibosIgnorados: 0,
  }

  for (const m of mensagens) {
    try {
      const desfecho = await processarMensagem(deps, m)
      if (desfecho === 'persistida') resumo.mensagens += 1
      else if (desfecho === 'duplicada') resumo.duplicadas += 1
      else resumo.descartadas += 1
    } catch (erro) {
      // So id/wamid no log; telefone, conteudo e token nunca entram. A Meta reentrega.
      deps.logger.error({ err: erro, wamid: m.wamid }, 'falha ao persistir inbound')
    }
  }

  for (const r of statuses) {
    try {
      if (await processarRecibo(deps, deps.pool, r)) resumo.recibos += 1
      else resumo.recibosIgnorados += 1
    } catch (erro) {
      deps.logger.error({ err: erro, wamid: r.wamid }, 'falha ao aplicar recibo')
    }
  }

  return resumo
}
