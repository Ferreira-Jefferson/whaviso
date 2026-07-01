import type { Pool } from '@whaviso/shared/db'
import { decidirReagendamento } from '../../shared/retry'

export interface NotificacaoClaim {
  id: string
  aviso_id: string
  cobrador_id: string | null
  alvo_papel: 'cobrador' | 'devedor'
  tipo: string
  tentativas: number
  coalesce_grupo: string | null
}

/** Espaçamento mínimo entre mensagens ao MESMO destinatário (H10.9). */
const ESPACO_DESTINATARIO_MIN = 10

export interface DadosNotificacao {
  aviso_status: string
  direcao: 'receber' | 'pagar'
  criador_papel: 'cobrador' | 'devedor'
  codigo: string
  nome_devedor: string
  // Nome de quem RECEBE (cobrador), para as mensagens ao devedor (E8 devedor.*: {{3}}).
  nome_cobrador: string
  motivo: string
  valor_centavos: number
  data_combinada: string
  // E14: chave/titular/banco do combinado, para a notificação devedor.pix_chave_recebida.
  // NUNCA logados (só vão a render/envio).
  pix_chave: string | null
  pix_titular: string | null
  pix_banco: string | null
  // Telefone resolvido do ALVO (com conta = profile; sem conta = telefone_alvo).
  telefone_alvo: string | null
  // Nome para a saudação do alvo (profile.nome quando tem conta; senão o do aviso).
  nome_alvo: string
  // Profile do CRIADOR do combinado (dono do plano), para o limite de envios (H10.8).
  // null = criador sem conta (sem plano a limitar; só WhatsApp, H10.7).
  criador_profile_id: string | null
}

const LIMITE_CLAIM = 10

/** Reseta notificações travadas em 'processando' há mais de 10 min (crash-safety). */
export async function ressuscitarTravados(pool: Pool): Promise<number> {
  const { rowCount } = await pool.query(
    `update public.notificacoes_cobrador set status='agendado'
     where status='processando' and criado_em < now() - interval '10 minutes'`,
  )
  return rowCount ?? 0
}

/**
 * Claim atômico das notificações devidas (FOR UPDATE SKIP LOCKED), com:
 *  - janela de agendamento: só linhas com `agendar_para <= now()` (H10.5 opt-out +1min);
 *  - espaçamento de 10min por DESTINATÁRIO (H10.9): uma linha só é liberada se NÃO houve
 *    envio ao mesmo alvo (mesmo cobrador_id OU mesmo telefone_alvo) nos últimos 10min.
 *    O destinatário do espaçamento é o profile (cobrador_id) quando existe, senão o
 *    telefone_alvo. Itens acumulados ao mesmo alvo saem em sequência, um a cada janela.
 * O gate é avaliado dentro do mesmo SELECT ... FOR UPDATE SKIP LOCKED (atômico entre
 * drainers): a subquery de "último enviado ao alvo" usa o índice parcial em enviado_em.
 * Complementa (não substitui) a distância de 10min/devedor do agendamento (H6.9).
 */
export async function reivindicar(pool: Pool): Promise<NotificacaoClaim[]> {
  const { rows } = await pool.query<NotificacaoClaim>(
    `update public.notificacoes_cobrador set status='processando'
     where id in (
       select id from public.notificacoes_cobrador n
       where n.status='agendado'
         and n.agendar_para <= now()
         and (n.proxima_tentativa_em is null or n.proxima_tentativa_em <= now())
         -- Espaçamento de 10min por destinatário: nenhum envio recente ao mesmo alvo.
         and not exists (
           select 1 from public.notificacoes_cobrador e
           where e.status='enviado'
             and e.enviado_em > now() - interval '${ESPACO_DESTINATARIO_MIN} minutes'
             and (
               (n.cobrador_id is not null and e.cobrador_id = n.cobrador_id)
               or (n.cobrador_id is null and e.telefone_alvo = n.telefone_alvo)
             )
         )
         -- 1 linha por destinatário no lote (a mais antiga por agendar_para vence):
         -- impede liberar 2 itens ao MESMO alvo na mesma janela (acúmulo sai espaçado).
         and not exists (
           select 1 from public.notificacoes_cobrador a
           where a.status='agendado'
             and a.agendar_para <= now()
             and (a.proxima_tentativa_em is null or a.proxima_tentativa_em <= now())
             and a.id <> n.id
             and (a.agendar_para < n.agendar_para
                  or (a.agendar_para = n.agendar_para and a.id < n.id))
             and (
               (n.cobrador_id is not null and a.cobrador_id = n.cobrador_id)
               or (n.cobrador_id is null and a.telefone_alvo = n.telefone_alvo)
             )
         )
       order by n.agendar_para
       limit ${LIMITE_CLAIM}
       for update skip locked
     )
     returning id, aviso_id, cobrador_id, alvo_papel, tipo, tentativas, coalesce_grupo`,
  )
  return rows
}

/**
 * Carrega os dados do aviso + alvo da notificação (pelo id da linha de claim).
 * Roteamento do telefone:
 *  - com conta (`cobrador_id` presente): telefone/nome do profile;
 *  - sem conta (`cobrador_id` null): telefone_alvo da própria linha; o nome de
 *    saudação vem do aviso conforme o papel do alvo (nome_cobrador / nome_devedor).
 * NUNCA loga telefone: só roteia o envio.
 */
export async function carregarDados(pool: Pool, notifId: string): Promise<DadosNotificacao | null> {
  const { rows } = await pool.query<DadosNotificacao>(
    `select a.status as aviso_status, a.direcao, a.criador_papel,
            substr(a.id::text, 1, 6) as codigo,
            a.nome_devedor,
            -- Nome de "quem vai receber" (cobrador). No RECEBER a coluna nome_cobrador é
            -- nula (o cobrador é o criador/dono da conta), então cai no nome do profile do
            -- criador; assim o convite (E5 H5.0) e as mensagens devedor.* nomeiam quem
            -- registrou o combinado em vez de mostrar vazio. No invertido a coluna já traz
            -- o nome do cobrador convidado (vindo do formulário).
            coalesce(nullif(a.nome_cobrador, ''), pcriador.nome, '') as nome_cobrador, a.motivo,
            a.valor_centavos::bigint as valor_centavos,
            to_char(a.data_combinada,'YYYY-MM-DD') as data_combinada,
            -- E14: snapshot do Pix p/ a notificação ao devedor (devedor.pix_chave_recebida).
            a.pix_chave, a.pix_titular, a.pix_banco,
            -- telefone do alvo: profile (com conta) OU telefone_alvo (sem conta).
            coalesce(p.telefone, n.telefone_alvo) as telefone_alvo,
            -- nome de saudação do alvo: profile, senão o nome do aviso por papel.
            coalesce(p.nome,
              case when n.alvo_papel = 'cobrador'
                   then coalesce(a.nome_cobrador, '')
                   else a.nome_devedor end) as nome_alvo,
            -- profile do CRIADOR (dono do plano): cobrador no receber, devedor no invertido.
            case when a.criador_papel = 'cobrador' then a.cobrador_id else a.devedor_profile_id end as criador_profile_id
     from public.notificacoes_cobrador n
     join public.avisos a on a.id = n.aviso_id
     left join public.profiles p on p.id = n.cobrador_id
     -- profile do CRIADOR quando ele é o cobrador (receber): fonte do nome "quem recebe".
     left join public.profiles pcriador on a.criador_papel = 'cobrador' and pcriador.id = a.cobrador_id
     where n.id = $1`,
    [notifId],
  )
  if (!rows[0]) return null
  return { ...rows[0], valor_centavos: Number(rows[0].valor_centavos) }
}

/**
 * Falta de template ativo para a linha JÁ reivindicada (status 'processando'): NÃO é
 * falha de envio. Devolve a linha a 'agendado' com o motivo VISÍVEL e RECUPERÁVEL
 * 'sem_template_ativo' (o owner vê em /admin/notificacoes), sem tocar tentativas e sem
 * PII. A linha volta a drenar assim que o template for ativado.
 */
export async function devolverSemTemplate(pool: Pool, id: string, motivo: string): Promise<void> {
  await pool.query(
    `update public.notificacoes_cobrador set status='agendado', erro=$2 where id=$1`,
    [id, motivo],
  )
}

export async function marcarEnviado(pool: Pool, id: string, wamid: string): Promise<void> {
  // enviado_em carimba a base do espaçamento de 10min por destinatário (H10.9).
  await pool.query(
    `update public.notificacoes_cobrador set status='enviado', wamid=$2, enviado_em=now(), erro=null where id=$1`,
    [id, wamid],
  )
}

/**
 * Cancela a linha por coalescing/obsolescência (status='cancelado', NUNCA DELETE) e
 * AUDITA o cancelamento em eventos_aviso (append-only, M5), sem PII (só tipo da
 * notificação + motivo). Roda numa transação para o cancelamento e a auditoria
 * caírem juntos. Idempotente: só audita se a linha ainda não estava cancelada.
 */
export async function marcarCanceladoAuditado(
  pool: Pool,
  id: string,
  avisoId: string,
  tipo: string,
  motivo: string,
): Promise<void> {
  const cli = await pool.connect()
  try {
    await cli.query('begin')
    const { rowCount } = await cli.query(
      `update public.notificacoes_cobrador set status='cancelado', erro=$2
        where id=$1 and status <> 'cancelado'`,
      [id, motivo],
    )
    if ((rowCount ?? 0) > 0) {
      await cli.query(
        `insert into public.eventos_aviso (aviso_id, tipo, ator, detalhes)
         values ($1, 'notificacao_coalescida', 'sistema', jsonb_build_object('notificacao', $2::text, 'motivo', $3::text))`,
        [avisoId, tipo, motivo],
      )
    }
    await cli.query('commit')
  } catch (e) {
    await cli.query('rollback')
    throw e
  } finally {
    cli.release()
  }
}

export async function marcarCancelado(pool: Pool, id: string, erro: string): Promise<void> {
  await pool.query(`update public.notificacoes_cobrador set status='cancelado', erro=$2 where id=$1`, [id, erro])
}

export async function marcarFalhou(pool: Pool, id: string, erro: string): Promise<void> {
  await pool.query(
    `update public.notificacoes_cobrador set status='falhou', tentativas=tentativas+1, erro=$2 where id=$1`,
    [id, erro],
  )
}

/**
 * Falha transitória: reagenda com intervalo aleatório 20-60s (shared/retry), ou
 * falha definitivamente após MAX_TENTATIVAS (exatamente 3 tentativas). Alinhado ao
 * enviar_lembretes (mesma política).
 */
export async function reagendarOuFalhar(
  pool: Pool,
  id: string,
  tentativasAtuais: number,
  erro: string,
): Promise<'reagendado' | 'falhou'> {
  const d = decidirReagendamento(tentativasAtuais)
  if (d.acao === 'falhou') {
    await marcarFalhou(pool, id, erro)
    return 'falhou'
  }
  await pool.query(
    `update public.notificacoes_cobrador
       set status='agendado', tentativas=$2, proxima_tentativa_em=now() + ($3 || ' seconds')::interval, erro=$4
     where id=$1`,
    [id, d.proxima, String(d.segundos), erro],
  )
  return 'reagendado'
}
