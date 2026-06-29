// Mini-chat de teste do WhatsApp (diagnóstico do owner). Drena a fila de SAÍDA
// (whats_teste_mensagens) no mesmo scheduler das automáticas e envia pelo MESMO
// transporte Baileys (whats.enviarTexto), porém SEM template/agendamento de aviso:
// é texto livre para um número de teste. Também captura as RESPOSTAS desse número
// (listener inbound adicional) para o painel mostrar a conversa. O app-root (scheduler/
// server) liga o módulo; o módulo não importa outro módulo.
import type { Pool } from '@whaviso/shared/db'
import type { Logger } from '@whaviso/shared/logger'
import { ErroEnvio, type ClienteWhats, type EventoTexto } from '../../shared/baileys_client'
import * as repo from './repo'

export interface DepsTeste {
  pool: Pool
  logger: Logger
  whats: ClienteWhats
}

/**
 * Envia as mensagens de teste agendadas. Diferente do drainer do ciclo, uma falha de
 * envio marca 'falhou' direto (sem retry): o owner está olhando o chat e reenviaria à
 * mão; e o motivo da falha (ex.: 'envio_0' = desconectado) é o próprio diagnóstico.
 * Nunca loga texto nem telefone (regra de ouro); só id e motivo.
 */
export async function processarTestesDevidos(deps: DepsTeste): Promise<number> {
  const lote = await repo.reivindicar(deps.pool)
  if (lote.length === 0) return 0
  let enviados = 0
  for (const m of lote) {
    try {
      const { wamid } = await deps.whats.enviarTexto(m.telefone, m.texto)
      await repo.marcarEnviado(deps.pool, m.id, wamid)
      enviados++
    } catch (erro) {
      const motivo = erro instanceof ErroEnvio ? `envio_${erro.codigo}` : 'erro_envio'
      await repo.marcarFalhou(deps.pool, m.id, motivo)
      deps.logger.warn({ id: m.id, motivo }, 'falha ao enviar mensagem de teste')
    }
  }
  return enviados
}

/**
 * Liga a captura das RESPOSTAS do número de teste. Registra um listener de texto
 * adicional (onTexto aceita vários): só grava quando o remetente é o número de teste
 * configurado. O webhook_whatsapp ignora esse número, então a resposta fica restrita
 * ao mini-chat e não entra na máquina de estados.
 */
export function registrarInboundTeste(deps: DepsTeste): void {
  deps.whats.onTexto(async (e: EventoTexto) => {
    const numero = await repo.numeroDeTeste(deps.pool)
    if (!numero) return
    if (`+${e.telefone.replace(/\D/g, '')}` !== numero) return
    await repo.gravarEntrada(deps.pool, numero, e.texto, e.wamid).catch((err) =>
      deps.logger.warn({ err }, 'falha ao gravar resposta de teste'),
    )
  })
}
