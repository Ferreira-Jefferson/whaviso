// Enfileirador da outbox de BILLING (notificacoes_billing, 0060): a `api` só ENFILEIRA a
// mensagem de compra de crédito (recarga); o `zap` drena e envia. Mantém a integração
// api<->zap só pelo banco (módulo nunca importa módulo). NUNCA loga telefone (só roteia).
import type { PoolClient } from '@whaviso/shared/db'

export interface EnfileirarRecarga {
  profileId: string
  /** E.164. Snapshot do telefone no momento da recarga. */
  telefone: string
  quantidade: number
  valorCentavos: number
}

/**
 * Insere uma linha 'agendado' na outbox de billing. O zap monta o template billing.recarga
 * (com a chave Pix da plataforma) e envia ao WhatsApp do usuário. Roda na transação do
 * chamador (o endpoint de recarga).
 */
export async function enfileirarRecarga(cli: PoolClient, args: EnfileirarRecarga): Promise<void> {
  await cli.query(
    `insert into public.notificacoes_billing
       (profile_id, telefone_alvo, quantidade, valor_centavos)
     values ($1, $2, $3, $4)`,
    [args.profileId, args.telefone, args.quantidade, args.valorCentavos],
  )
}
