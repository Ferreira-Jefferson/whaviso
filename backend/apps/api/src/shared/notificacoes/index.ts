// Enfileirador compartilhado da outbox GENERALIZADA `notificacoes_cobrador` (a `api`
// só ENFILEIRA; o `zap` drena e envia). Roteia o ALVO da notificação:
//   - com conta  -> grava cobrador_id (o zap lê o telefone do profile);
//   - sem conta  -> grava telefone_alvo (o zap envia direto, sem profile).
// O ALVO é o CRIADOR do combinado: no fluxo `receber` é o cobrador; no `pagar`
// invertido (criador = devedor) é o devedor-criador. NUNCA loga telefone (só roteia).
//
// dedupe_key = 'aviso_id:tipo:ocorrencia' (H10.2/H10.8): o índice único parcial do
// banco (enquanto status<>'cancelado') impede 2a linha ativa para o mesmo evento. O
// `ocorrencia` avança a cada NOVO evento legítimo (toque duplo = 1; pago->rejeitado->
// pago = 2), por isso é calculado a partir do histórico de eventos do aviso.
//
// E10b: além do enfileiramento "na hora", suporta AGENDAMENTO (janela de 1min do
// opt-out, H10.5) e COALESCING do par evento/contra-evento (opt-out/reativação se
// anulam). O espaçamento de 10min por destinatário é do DRAINER (zap), não daqui.
import type { PoolClient } from '@whaviso/shared/db'

export type TipoNotificacao =
  // E5: o Whaviso INICIA a conversa mandando o combinado (resumo + botões) ao CONVIDADO
  // assim que ele entra em aguardando_aceite (não é ao criador).
  | 'combinado_enviar'
  | 'pagamento_informado'
  | 'combinado_aceito'
  | 'combinado_dado_incorreto'
  | 'combinado_recusado'
  | 'optout'
  | 'reativacao'
  // E2: notificações ao DEVEDOR (quem recebe os lembretes) sobre o ESTADO do combinado.
  | 'aviso_pausado'
  | 'aviso_reativado'
  | 'aviso_cancelado'
  | 'aviso_edicao_a_aprovar'
  // E2: edição recusada pelo devedor -> notifica o COBRADOR (criador no receber).
  | 'edicao_recusada'
  // E8: notificações ao DEVEDOR ligadas à confirmação de pagamento. `encerramento` é
  // ADIADA ~1min (janela de reversão, H8.1) e cancelável pela reabertura no minuto;
  // `status_alterado` é a 2a mensagem quando a reabertura ocorre DEPOIS do minuto (H8.6);
  // `rejeicao` avisa o devedor de forma neutra que o pagamento não foi localizado (H8.2);
  // `reengajamento` é a mensagem manual pós-ciclo com os 3 botões (H8.3).
  | 'encerramento'
  | 'status_alterado'
  | 'rejeicao'
  | 'reengajamento'
  // E8 H8.7 (recorrente): confirmação de uma ocorrência INTERMEDIÁRIA (k < N). Usa o
  // template `devedor.encerramento` na variante 'revisao' ("pagamento deste mês
  // confirmado, o próximo lembrete chega perto da próxima data"). O aviso NÃO vira pago
  // (volta a `programado`), então não compartilha a janela de reversão do `encerramento`.
  | 'encerramento_recorrente'

type Papel = 'cobrador' | 'devedor'

interface AvisoAlvo {
  id: string
  criador_papel: Papel
  cobrador_id: string | null
  devedor_profile_id: string | null
  telefone_cobrador: string | null
  telefone_devedor: string | null
}

/**
 * Resolve quem é o ALVO (criador do combinado) e por qual canal.
 *  - receber  (criador = cobrador): conta -> cobrador_id; sem conta -> telefone_cobrador.
 *  - invertido (criador = devedor):  conta -> devedor_profile_id; sem conta -> telefone_devedor.
 * Retorna o papel do alvo e (id de profile XOR telefone). Se não houver alvo possível
 * (nem conta nem telefone), devolve null e o chamador NÃO enfileira.
 */
function resolverAlvo(
  aviso: AvisoAlvo,
): { alvoPapel: Papel; cobradorId: string | null; telefoneAlvo: string | null } | null {
  if (aviso.criador_papel === 'cobrador') {
    if (aviso.cobrador_id) return { alvoPapel: 'cobrador', cobradorId: aviso.cobrador_id, telefoneAlvo: null }
    if (aviso.telefone_cobrador) return { alvoPapel: 'cobrador', cobradorId: null, telefoneAlvo: aviso.telefone_cobrador }
    return null
  }
  // invertido: o criador é o devedor.
  if (aviso.devedor_profile_id) return { alvoPapel: 'devedor', cobradorId: aviso.devedor_profile_id, telefoneAlvo: null }
  if (aviso.telefone_devedor) return { alvoPapel: 'devedor', cobradorId: null, telefoneAlvo: aviso.telefone_devedor }
  return null
}

/**
 * Conta as OCORRÊNCIAS já vividas deste tipo de evento no aviso, para compor a
 * dedupe_key. A contagem é pelo trilho de auditoria (eventos_aviso), que avança a
 * cada novo evento legítimo. Para `pagamento_informado` o evento-fonte é
 * `ja_paguei_devedor`: 1 toque -> 1; pago->rejeitado->pago -> 2 (dois eventos).
 * Tipos sem evento-fonte mapeado caem em 1 (1 notificação por aviso até E10b refinar).
 */
const EVENTO_FONTE: Partial<Record<TipoNotificacao, string>> = {
  pagamento_informado: 'ja_paguei_devedor',
  combinado_aceito: 'aceite',
  combinado_recusado: 'recusado',
  // E3 H3.3: o devedor-criador é notificado quando o cobrador aponta dado/chave
  // incorreta (sinal `pix_incorreto`). Cada novo sinal = nova ocorrência.
  combinado_dado_incorreto: 'pix_incorreto',
  optout: 'optout',
  reativacao: 'reativado',
  // E2: o evento-fonte conta as ocorrências p/ a dedupe_key (cada novo evento = nova
  // notificação legítima; toque duplo na mesma transação = 1).
  aviso_pausado: 'pausado',
  aviso_reativado: 'reativado',
  // C2: o cancelamento passa a gravar `cancelado_criador` (ator = papel do criador),
  // tanto no receber quanto no invertido.
  aviso_cancelado: 'cancelado_criador',
  aviso_edicao_a_aprovar: 'editado',
  edicao_recusada: 'editado_recusado',
  // E8: a ocorrência avança a cada novo evento legítimo. `rejeicao` (C2): toque-duplo no
  // botão "Ainda não recebi" antes de o estado mudar serializa no FOR UPDATE e grava 1
  // `rejeitado_cobrador` -> 1 notificação. `status_alterado` conta pelas reaberturas
  // (cada reabertura tardia = nova mensagem). `encerramento` não usa contra-evento aqui
  // (a janela é tratada por coalesce_grupo + reconferência de estado no drainer).
  rejeicao: 'rejeitado_cobrador',
  status_alterado: 'reaberto_cobrador',
  // E8 H8.7: cada ocorrência confirmada grava um `confirmado_cobrador`; a contagem deles
  // dá a ocorrência da dedupe_key (1 mensagem de "pagamento deste mês" por ocorrência).
  encerramento_recorrente: 'confirmado_cobrador',
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

export interface ResultadoEnfileiramento {
  enfileirado: boolean // false = sem alvo possível OU duplicata (dedupe)
}

export interface OpcoesEnfileirar {
  /** Adiamento do agendamento em segundos (janela de 1min do opt-out: 60). Default 0 (agora). */
  agendarAposSeg?: number
  /** Grupo de coalescing do par evento/contra-evento (opt-out/reativação se anulam). */
  coalesceGrupo?: string
}

/**
 * Enfileira uma notificação ao criador do combinado, na MESMA transação que muda o
 * estado. Idempotente: o índice único parcial em dedupe_key (status<>'cancelado')
 * trata a 2a inserção do mesmo evento como no-op (toque duplo = 1 notificação).
 * `agendarAposSeg` adia a saída (janela de 1min do opt-out, H10.5); `coalesceGrupo`
 * marca o par que pode se anular. NUNCA loga telefone (só roteia o canal).
 */
export async function enfileirarNotificacao(
  cli: PoolClient,
  aviso: AvisoAlvo,
  tipo: TipoNotificacao,
  opcoes: OpcoesEnfileirar = {},
): Promise<ResultadoEnfileiramento> {
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

/**
 * Grupo de coalescing do par opt-out/reativação de um aviso (H10.5/H10.9). Estável por
 * aviso: as linhas de opt-out de um mesmo aviso compartilham o grupo, e a reativação as
 * cancela em bloco.
 */
export function grupoOptoutReativa(avisoId: string): string {
  return `${avisoId}:optout_reativa`
}

/**
 * Cancela as linhas de opt-out AINDA NÃO ENVIADAS de um aviso (par que se anula, H10.5).
 * Vale para 'agendado' E 'processando' (a corrida em que o drainer já reivindicou a
 * linha; o drainer faz a reconferência por estado antes de enviar). NUNCA DELETE
 * (status='cancelado'); AUDITA cada cancelamento em eventos_aviso (M5), sem PII.
 * Retorna quantas linhas foram anuladas (0 = a saída já foi enviada -> 2a notificação).
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
 * E2: enfileira uma notificação ao DEVEDOR (quem recebe os lembretes) sobre o ESTADO
 * do combinado (pausa/reativa/cancela/edição a aprovar). Diferente de
 * `enfileirarNotificacao` (que mira o CRIADOR): aqui o alvo é SEMPRE o devedor,
 * independentemente de quem criou. Roteia por conta (devedor_profile_id) ou telefone
 * (telefone_devedor). Sem alvo possível (nem conta nem telefone), NÃO enfileira.
 * Mesma idempotência por dedupe_key. NUNCA loga telefone.
 */
export async function enfileirarNotificacaoDevedor(
  cli: PoolClient,
  aviso: AvisoAlvo,
  tipo: TipoNotificacao,
  opcoes: OpcoesEnfileirar = {},
): Promise<ResultadoEnfileiramento> {
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

/**
 * E5: enfileira o COMBINADO ao CONVIDADO (o NÃO criador) assim que ele entra em
 * `aguardando_aceite`. O Whaviso inicia a conversa: o `zap` drena e manda o template
 * `combinado.resumo` (resumo + 3 botões) direto ao WhatsApp do convidado.
 *  - receber  (criador = cobrador): convidado = devedor  -> telefone_devedor.
 *  - invertido (criador = devedor):  convidado = cobrador -> telefone_cobrador.
 * No aguardando_aceite o convidado quase sempre NÃO tem conta (ela nasce no aceite,
 * H5.3), então o alvo é por TELEFONE; se já existir profile (raro), roteia por ele.
 * Sem alvo possível (nem conta nem telefone), NÃO enfileira. Idempotente por dedupe_key
 * (um envio por combinado). NUNCA loga telefone (só roteia o canal).
 */
export async function enfileirarConvite(
  cli: PoolClient,
  aviso: AvisoAlvo,
): Promise<ResultadoEnfileiramento> {
  const ehReceber = aviso.criador_papel === 'cobrador'
  const alvoPapel: Papel = ehReceber ? 'devedor' : 'cobrador'
  const cobradorId = ehReceber ? aviso.devedor_profile_id : aviso.cobrador_id
  const telefoneAlvo = cobradorId ? null : ehReceber ? aviso.telefone_devedor : aviso.telefone_cobrador
  if (!cobradorId && !telefoneAlvo) return { enfileirado: false }

  const ocorrencia = await ocorrenciaAtual(cli, aviso.id, 'combinado_enviar')
  const dedupeKey = `${aviso.id}:combinado_enviar:${ocorrencia}`

  const { rowCount } = await cli.query(
    `insert into public.notificacoes_cobrador
       (aviso_id, tipo, alvo_papel, cobrador_id, telefone_alvo, dedupe_key, agendar_para)
     values ($1, 'combinado_enviar', $2, $3, $4, $5, now())
     on conflict (dedupe_key) where (dedupe_key is not null and status <> 'cancelado') do nothing`,
    [aviso.id, alvoPapel, cobradorId, telefoneAlvo, dedupeKey],
  )
  return { enfileirado: (rowCount ?? 0) > 0 }
}

/**
 * E8 H8.1/H8.6: grupo de coalescing do par confirmação/reabertura de um aviso. A mensagem
 * de `encerramento` agendada +1min compartilha este grupo; a reabertura DENTRO do minuto
 * cancela a linha do mesmo grupo ainda não enviada (devedor não recebe nada).
 */
export function grupoEncerramento(avisoId: string): string {
  return `${avisoId}:encerramento`
}

/**
 * E8 H8.6 (C1): cancela a mensagem de `encerramento` AINDA NÃO ENVIADA de um aviso
 * (reabertura dentro da janela de 1min). Vale para 'agendado' E 'processando' (corrida em
 * que o drainer já reivindicou a linha; ele reconfere `aviso.status='pago'` antes de
 * enviar, ver notificar_cobrador). NUNCA DELETE (status='cancelado'); AUDITA cada
 * cancelamento em eventos_aviso (sem PII). Retorna quantas linhas foram anuladas (0 = a
 * mensagem já saiu -> a reabertura tardia enfileira `status_alterado`).
 */
export async function cancelarEncerramentoPendente(cli: PoolClient, avisoId: string): Promise<number> {
  const { rows } = await cli.query<{ id: string }>(
    `update public.notificacoes_cobrador
        set status='cancelado', erro='reabertura_anulou'
      where aviso_id=$1 and tipo='encerramento' and status in ('agendado','processando')
      returning id`,
    [avisoId],
  )
  for (let i = 0; i < rows.length; i++) {
    await cli.query(
      `insert into public.eventos_aviso (aviso_id, tipo, ator, detalhes)
       values ($1, 'notificacao_coalescida', 'sistema', jsonb_build_object('notificacao','encerramento','motivo','reabertura_anulou'))`,
      [avisoId],
    )
  }
  return rows.length
}
