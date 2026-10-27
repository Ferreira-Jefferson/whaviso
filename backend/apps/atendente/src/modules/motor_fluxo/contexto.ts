// Montagem do contexto do turno: a partir da mensagem reivindicada e da conversa travada, carrega
// loja, cliente, ultimo endereco, cardapio VIVO e status do pedido corrente, e normaliza a entrada.
// Tudo filtrado pela loja_id da conversa (SEC-001/002). O estado do fluxo vem de conversas.contexto;
// forma invalida/ausente cai no estado inicial (saudacao).
import type { PoolClient } from '@whaviso/shared/db'
import { normalizarMensagem } from './entrada'
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
): Promise<ContextoTurno | null> {
  // Sequencial: a transacao do turno usa um unico PoolClient (sem queries concorrentes).
  const loja = await leitura.lerLoja(tx, conversa.loja_id)
  const cliente = await leitura.lerCliente(tx, conversa.loja_id, conversa.cliente_id)
  if (!loja || !cliente) return null

  const estado = lerEstado(conversa.contexto)
  const cardapioRaw = await leitura.lerCardapioRaw(tx, conversa.loja_id)
  const ultimoEndereco = await leitura.lerUltimoEndereco(tx, conversa.loja_id, conversa.cliente_id)
  const zonasBairros = await leitura.lerZonasBairros(tx, conversa.loja_id)
  const pedidoStatus = estado.pedido_id
    ? await leitura.lerStatusPedido(tx, conversa.loja_id, estado.pedido_id)
    : null

  const entrada: EntradaTurno = {
    evento: normalizarMensagem(claim),
    estado,
    loja: { id: loja.id, nome: loja.nome, horarios: loja.horarios },
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
  }
}
