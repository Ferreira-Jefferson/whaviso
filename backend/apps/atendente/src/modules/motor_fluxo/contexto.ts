// Montagem do contexto do turno: a partir da mensagem reivindicada e da conversa travada, carrega
// loja, cliente, ultimo endereco, cardapio VIVO e status do pedido corrente, e normaliza a entrada.
// Tudo filtrado pela loja_id da conversa (SEC-001/002). O estado do fluxo vem de conversas.contexto;
// forma invalida/ausente cai no estado inicial (saudacao).
import type { PoolClient } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import { modoAtendente } from '@whaviso/shared/disponibilidade'
import { normalizarMensagem } from './entrada'
import { resolverFonte, type FonteFluxo } from './fluxo_fonte'
import { montarCardapio } from './montar_cardapio'
import * as leitura from './repo_leitura'
import { EstadoFluxo, estadoInicial, type EntradaTurno } from './tipos'

export interface ContextoTurno {
  entrada: EntradaTurno
  conversaId: string
  lojaId: string
  numeroId: string
  clienteId: string
  destinatarioHash: string
  /** Grafo (publicado ou padrao) que DIRIGE este turno e a versao fixada na conversa. */
  fonte: FonteFluxo
}

/** Pausa em vigor agora: pausada e (sem prazo ou prazo ainda no futuro). Relogio do turno (injetavel). */
function pausadaAgora(loja: leitura.LojaRow, agora: Date): boolean {
  return loja.pausada && (loja.pausada_ate === null || loja.pausada_ate.getTime() > agora.getTime())
}

function lerEstado(contexto: unknown): EstadoFluxo {
  const parsed = EstadoFluxo.safeParse(contexto)
  return parsed.success ? parsed.data : estadoInicial()
}

export async function montarContexto(
  tx: PoolClient,
  claim: leitura.MensagemClaim,
  conversa: leitura.ConversaCtx,
  agora: Date,
  logger: Logger,
  cardapioPreCarregado?: leitura.CardapioRaw,
): Promise<ContextoTurno | null> {
  // Sequencial: a transacao do turno usa um unico PoolClient (sem queries concorrentes).
  const loja = await leitura.lerLoja(tx, conversa.loja_id)
  const cliente = await leitura.lerCliente(tx, conversa.loja_id, conversa.cliente_id)
  if (!loja || !cliente) return null

  const estadoLido = lerEstado(conversa.contexto)
  // Grafo que dirige este turno: a versao fixada na conversa, ou a publicada vigente (que o motor
  // fixa agora, se a conversa ainda nao fixou). Conversa termina na versao em que comecou.
  const fonte = await resolverFonte(tx, conversa.loja_id, estadoLido.fluxo_versao_id, logger)
  const estado: EstadoFluxo = { ...estadoLido, fluxo_versao_id: fonte.versaoId }

  // Pre-carregado (fora do lock da conversa) so vale se a loja do claim e a da conversa; senao le agora.
  const cardapioRaw =
    cardapioPreCarregado && claim.loja_id === conversa.loja_id
      ? cardapioPreCarregado
      : await leitura.lerCardapioRaw(tx, conversa.loja_id)
  const ultimoEndereco = await leitura.lerUltimoEndereco(tx, conversa.loja_id, conversa.cliente_id)
  const zonasBairros = await leitura.lerZonasBairros(tx, conversa.loja_id)
  const pedidoStatus = estado.pedido_id
    ? await leitura.lerStatusPedido(tx, conversa.loja_id, estado.pedido_id)
    : null

  // Modo do atendente derivado da disponibilidade da loja (fonte unica, regras-negocio/05): o motor
  // nao tem horario proprio. atendimento|agendamento|fechado guia a comunicacao dos nodes.
  const dados = await leitura.lerDisponibilidade(tx, conversa.loja_id, agora)
  const agendamento = await leitura.lerAgendamento(tx, conversa.loja_id)
  const modo = modoAtendente(dados, agendamento, agora)

  const entrada: EntradaTurno = {
    evento: normalizarMensagem(claim),
    estado,
    loja: { id: loja.id, nome: loja.nome, modo, pausada_agora: pausadaAgora(loja, agora) },
    cliente: { id: cliente.id, nome: cliente.nome, telefone_hash: cliente.telefone_hash },
    cardapio: montarCardapio(cardapioRaw, agora),
    ultimoEnderecoId: ultimoEndereco?.id ?? null,
    ultimoEnderecoBairro: ultimoEndereco?.bairro ?? null,
    zonasBairros,
    pedidoStatus,
    agora,
  }
  return {
    entrada,
    conversaId: conversa.id,
    lojaId: conversa.loja_id,
    numeroId: conversa.numero_whatsapp_id,
    clienteId: conversa.cliente_id,
    destinatarioHash: cliente.telefone_hash,
    fonte,
  }
}
