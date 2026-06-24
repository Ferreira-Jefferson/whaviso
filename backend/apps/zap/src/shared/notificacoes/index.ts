// Enfileirador da outbox generalizada `notificacoes_cobrador` no lado do ZAP (quando
// o evento chega pelo botão do WhatsApp, ex.: "Já paguei"). Espelha a disciplina do
// helper homônimo da api (apps não se importam): roteia o ALVO (criador do combinado)
// por conta ou por telefone, e usa dedupe_key 'aviso_id:tipo:ocorrencia' com o índice
// único parcial do banco para idempotência (toque duplo = 1 notificação).
// NUNCA loga telefone (só roteia o canal).
//
// E10b: suporta AGENDAMENTO (janela de 1min do opt-out, H10.5) e COALESCING do par
// opt-out/reativação (se anulam). O espaçamento de 10min/destinatário é do DRAINER.
import type { PoolClient } from '@whaviso/shared/db'

export type TipoNotificacao =
  | 'pagamento_informado'
  | 'convite_aceito'
  | 'convite_dado_incorreto'
  | 'convite_recusado'
  | 'convite_telefone_divergente'
  | 'convite_tentativas_esgotadas'
  | 'optout'
  | 'reativacao'
  // E2: estado do combinado ao DEVEDOR + edição recusada ao COBRADOR.
  | 'aviso_pausado'
  | 'aviso_reativado'
  | 'aviso_cancelado'
  | 'aviso_edicao_a_aprovar'
  | 'edicao_recusada'
  // E8: mensagens ao DEVEDOR ligadas à confirmação de pagamento (mesma semântica do
  // helper homônimo da api). `encerramento` adiada ~1min e cancelável pela reabertura;
  // `rejeicao` neutra quando o cobrador rejeita por botão no WhatsApp (H8.2/H8.5).
  | 'encerramento'
  | 'status_alterado'
  | 'rejeicao'
  | 'reengajamento'
  // E14: chave de pagamento cadastrada pelo cobrador (fluxo invertido), ao DEVEDOR.
  | 'pix_chave_recebida'

type Papel = 'cobrador' | 'devedor'

export interface AvisoAlvo {
  id: string
  criador_papel: Papel
  cobrador_id: string | null
  devedor_profile_id: string | null
  telefone_cobrador: string | null
  telefone_devedor: string | null
}

function resolverAlvo(
  aviso: AvisoAlvo,
): { alvoPapel: Papel; cobradorId: string | null; telefoneAlvo: string | null } | null {
  if (aviso.criador_papel === 'cobrador') {
    if (aviso.cobrador_id) return { alvoPapel: 'cobrador', cobradorId: aviso.cobrador_id, telefoneAlvo: null }
    if (aviso.telefone_cobrador) return { alvoPapel: 'cobrador', cobradorId: null, telefoneAlvo: aviso.telefone_cobrador }
    return null
  }
  if (aviso.devedor_profile_id) return { alvoPapel: 'devedor', cobradorId: aviso.devedor_profile_id, telefoneAlvo: null }
  if (aviso.telefone_devedor) return { alvoPapel: 'devedor', cobradorId: null, telefoneAlvo: aviso.telefone_devedor }
  return null
}

const EVENTO_FONTE: Partial<Record<TipoNotificacao, string>> = {
  pagamento_informado: 'ja_paguei_devedor',
  convite_aceito: 'aceite',
  convite_recusado: 'recusado',
  optout: 'optout',
  reativacao: 'reativado',
  aviso_pausado: 'pausado',
  aviso_reativado: 'reativado',
  aviso_cancelado: 'cancelado_cobrador',
  aviso_edicao_a_aprovar: 'editado',
  edicao_recusada: 'editado_recusado',
  // E8 (C2): a ocorrência da `rejeicao` avança a cada `rejeitado_cobrador` (toque-duplo no
  // botão serializa no FOR UPDATE -> 1 evento -> 1 notificação). `status_alterado` conta
  // pelas reaberturas tardias. `encerramento` usa coalesce_grupo + reconferência no drainer.
  rejeicao: 'rejeitado_cobrador',
  status_alterado: 'reaberto_cobrador',
  // E14: a ocorrência avança a cada chave cadastrada (1 por cadastro -> dedupe estável).
  pix_chave_recebida: 'pix_cadastrada',
}

async function ocorrenciaAtual(cli: PoolClient, avisoId: string, tipo: TipoNotificacao): Promise<number> {
  const evento = EVENTO_FONTE[tipo]
  if (!evento) return 1
  const { rows } = await cli.query<{ n: string }>(
    `select count(*)::int as n from public.eventos_aviso where aviso_id=$1 and tipo=$2::tipo_evento`,
    [avisoId, evento],
  )
  return Math.max(1, Number(rows[0]?.n ?? 1))
}

export interface OpcoesEnfileirar {
  /** Adiamento do agendamento em segundos (janela de 1min do opt-out: 60). Default 0. */
  agendarAposSeg?: number
  /** Grupo de coalescing do par evento/contra-evento (opt-out/reativação se anulam). */
  coalesceGrupo?: string
}

/**
 * Enfileira ao criador do combinado, na mesma transação. Idempotente pelo índice
 * único parcial em dedupe_key (status<>'cancelado'). `agendarAposSeg` adia a saída
 * (janela de 1min do opt-out, H10.5); `coalesceGrupo` marca o par que pode se anular.
 */
export async function enfileirarNotificacao(
  cli: PoolClient,
  aviso: AvisoAlvo,
  tipo: TipoNotificacao,
  opcoes: OpcoesEnfileirar = {},
): Promise<{ enfileirado: boolean }> {
  const alvo = resolverAlvo(aviso)
  if (!alvo) return { enfileirado: false }

  const ocorrencia = await ocorrenciaAtual(cli, aviso.id, tipo)
  const dedupeKey = `${aviso.id}:${tipo}:${ocorrencia}`
  const agendarSeg = opcoes.agendarAposSeg ?? 0

  const { rowCount } = await cli.query(
    `insert into public.notificacoes_cobrador
       (aviso_id, tipo, alvo_papel, cobrador_id, telefone_alvo, dedupe_key, agendar_para, coalesce_grupo)
     values ($1, $2, $3, $4, $5, $6, now() + ($7 || ' seconds')::interval, $8)
     on conflict (dedupe_key) where (dedupe_key is not null and status <> 'cancelado') do nothing`,
    [aviso.id, tipo, alvo.alvoPapel, alvo.cobradorId, alvo.telefoneAlvo, dedupeKey, String(agendarSeg), opcoes.coalesceGrupo ?? null],
  )
  return { enfileirado: (rowCount ?? 0) > 0 }
}

/** Grupo de coalescing do par opt-out/reativação de um aviso (H10.5/H10.9). */
export function grupoOptoutReativa(avisoId: string): string {
  return `${avisoId}:optout_reativa`
}

/**
 * Cancela as linhas de opt-out AINDA NÃO ENVIADAS de um aviso (par que se anula, H10.5).
 * Vale para 'agendado' E 'processando' (corrida com o drainer; o drainer reconfere o
 * estado antes de enviar). NUNCA DELETE; AUDITA cada cancelamento (M5), sem PII. Retorna
 * quantas linhas foram anuladas (0 = a saída já saiu -> 2a notificação de reativação).
 */
export async function cancelarOptoutPendente(cli: PoolClient, avisoId: string): Promise<number> {
  const { rows } = await cli.query<{ id: string }>(
    `update public.notificacoes_cobrador
        set status='cancelado', erro='reativacao_anulou'
      where aviso_id=$1 and tipo='optout' and status in ('agendado','processando')
      returning id`,
    [avisoId],
  )
  for (let i = 0; i < rows.length; i++) {
    await cli.query(
      `insert into public.eventos_aviso (aviso_id, tipo, ator, detalhes)
       values ($1, 'notificacao_coalescida', 'sistema', jsonb_build_object('notificacao','optout','motivo','reativacao_anulou'))`,
      [avisoId],
    )
  }
  return rows.length
}

/**
 * E8: enfileira uma mensagem ao DEVEDOR (quem recebe os lembretes), independente de quem
 * criou. Roteia por conta (devedor_profile_id) ou telefone (telefone_devedor). Usado pelo
 * webhook quando o COBRADOR confirma/rejeita por botão (H8.5): a confirmação enfileira
 * `encerramento` adiada +1min (cancelável pela reabertura); a rejeição enfileira `rejeicao`.
 * Idempotente pelo dedupe_key. NUNCA loga telefone.
 */
export async function enfileirarNotificacaoDevedor(
  cli: PoolClient,
  aviso: AvisoAlvo,
  tipo: TipoNotificacao,
  opcoes: OpcoesEnfileirar = {},
): Promise<{ enfileirado: boolean }> {
  const cobradorId = aviso.devedor_profile_id // a coluna guarda o profile do alvo
  const telefoneAlvo = aviso.devedor_profile_id ? null : aviso.telefone_devedor
  if (!cobradorId && !telefoneAlvo) return { enfileirado: false }

  const ocorrencia = await ocorrenciaAtual(cli, aviso.id, tipo)
  const dedupeKey = `${aviso.id}:${tipo}:${ocorrencia}`
  const agendarSeg = opcoes.agendarAposSeg ?? 0

  const { rowCount } = await cli.query(
    `insert into public.notificacoes_cobrador
       (aviso_id, tipo, alvo_papel, cobrador_id, telefone_alvo, dedupe_key, agendar_para, coalesce_grupo)
     values ($1, $2, 'devedor', $3, $4, $5, now() + ($6 || ' seconds')::interval, $7)
     on conflict (dedupe_key) where (dedupe_key is not null and status <> 'cancelado') do nothing`,
    [aviso.id, tipo, cobradorId, telefoneAlvo, dedupeKey, String(agendarSeg), opcoes.coalesceGrupo ?? null],
  )
  return { enfileirado: (rowCount ?? 0) > 0 }
}

/** E8 H8.1/H8.6: grupo de coalescing do par confirmação/reabertura (encerramento +1min). */
export function grupoEncerramento(avisoId: string): string {
  return `${avisoId}:encerramento`
}
