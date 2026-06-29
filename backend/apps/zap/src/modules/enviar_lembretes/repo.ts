import type { Pool } from '@whaviso/shared/db'
import type { EtapaEnvio } from '@whaviso/shared/contracts'
import type { ConteudoTemplate, StatusMeta } from '../../shared/templates'
import { decidirReagendamento } from '../../shared/retry'

export interface EnvioClaim {
  id: string
  aviso_id: string
  // E11: ocorrência à qual o envio pertence (null = combinado simples). A unidade de
  // consumo de crédito é a ocorrência (recorrente) ou o aviso (simples).
  ocorrencia_id: string | null
  etapa: EtapaEnvio
  tentativas: number
}

export interface DadosEnvio {
  aviso_id: string
  aviso_status: string
  // E14: no invertido (pagar) sem chave, o lembrete troca "Chave de Pag." por "Solicitar
  // chave de pagamento" (o devedor pede a chave a quem vai receber).
  direcao: 'receber' | 'pagar'
  nome_devedor: string
  telefone_devedor: string | null
  motivo: string
  valor_centavos: number
  data_combinada: string
  pix_chave: string | null
  nome_cobrador: string
  template_conteudo: ConteudoTemplate | null
  template_variaveis: string[] | null
  // Metadados do template Meta (envio por template aprovado + gating por status).
  template_nome_meta: string | null
  template_idioma: string | null
  template_status_meta: StatusMeta | null
}

// Lote pequeno por tick: mantém o espaçamento de 10min por devedor previsível e evita
// segurar muitas linhas em 'processando'. ressuscitarTravados cobre eventuais travas.
const LIMITE_CLAIM = 5

/** Reseta envios travados em 'processando' por mais de 10 min (crash-safety). */
export async function ressuscitarTravados(pool: Pool): Promise<number> {
  const { rowCount } = await pool.query(
    `update public.envios set status='agendado'
     where status='processando' and agendado_para < now() - interval '10 minutes'`,
  )
  return rowCount ?? 0
}

/** Espaçamento mínimo entre lembretes ao MESMO devedor (H10.9, complementa H6.9). */
const ESPACO_DEVEDOR_MIN = 10

/**
 * Claim atômico dos envios devidos (FOR UPDATE SKIP LOCKED), com espaçamento de 10min
 * por DESTINATÁRIO (devedor, H10.9): um envio só é liberado se NÃO houve outro envio ao
 * mesmo `telefone_devedor` nos últimos 10min, e no máximo 1 por devedor por janela
 * (acúmulo em runtime sai espaçado). COMPLEMENTA (não substitui) a distância de
 * 10min/devedor já garantida no agendamento (H6.9): aqui cobre o acúmulo em runtime
 * (ex.: catch-up, reprogramação). O destinatário é o telefone_devedor do aviso.
 */
export async function reivindicar(pool: Pool): Promise<EnvioClaim[]> {
  const { rows } = await pool.query<EnvioClaim>(
    `update public.envios set status='processando'
     where id in (
       select e.id from public.envios e
       join public.avisos av on av.id = e.aviso_id
       where e.status='agendado' and e.agendado_para <= now()
         and (e.proxima_tentativa_em is null or e.proxima_tentativa_em <= now())
         -- Espaçamento de 10min por devedor: nenhum envio recente ao mesmo telefone.
         and (av.telefone_devedor is null or not exists (
           select 1 from public.envios r
           join public.avisos ra on ra.id = r.aviso_id
           where r.status='enviado' and r.enviado_em > now() - interval '${ESPACO_DEVEDOR_MIN} minutes'
             and ra.telefone_devedor = av.telefone_devedor
         ))
         -- No máximo 1 envio por devedor por janela (o mais antigo por agendado_para).
         and (av.telefone_devedor is null or not exists (
           select 1 from public.envios o
           join public.avisos oa on oa.id = o.aviso_id
           where o.status='agendado' and o.agendado_para <= now()
             and (o.proxima_tentativa_em is null or o.proxima_tentativa_em <= now())
             and o.id <> e.id
             and oa.telefone_devedor = av.telefone_devedor
             and (o.agendado_para < e.agendado_para
                  or (o.agendado_para = e.agendado_para and o.id < e.id))
         ))
       order by e.agendado_para
       limit ${LIMITE_CLAIM}
       for update of e skip locked
     )
     returning id, aviso_id, ocorrencia_id, etapa, tentativas`,
  )
  return rows
}

export async function carregarDados(pool: Pool, avisoId: string, etapa: EtapaEnvio): Promise<DadosEnvio | null> {
  // G1: LEFT JOIN em cobrador_id. No fluxo INVERTIDO o cobrador é convidado e fica sem
  // profile (cobrador_id NULL) até vincular conta; o nome vive em avisos.nome_cobrador.
  // Um INNER JOIN descartaria esses avisos e o ciclo NUNCA sairia no invertido. Usamos
  // coalesce(a.nome_cobrador, p.nome) para a variável "quem recebe" do template (G11).
  //
  // Em 'informado_pago' a variante 'revisao' da etapa d_mais_1 é o EMPURRÃOZINHO (H6.5):
  // a única mensagem possível nesse estado. Para as demais etapas não há variante revisao
  // ativa; se um envio remanescente cair aqui em informado_pago, o index.ts o cancela.
  const { rows } = await pool.query<DadosEnvio>(
    `select a.id as aviso_id, a.status as aviso_status, a.direcao, a.nome_devedor, a.telefone_devedor,
            a.motivo, a.valor_centavos::bigint as valor_centavos,
            to_char(a.data_combinada,'YYYY-MM-DD') as data_combinada, a.pix_chave,
            coalesce(a.nome_cobrador, p.nome) as nome_cobrador,
            t.conteudo as template_conteudo, t.variaveis as template_variaveis,
            t.nome_meta as template_nome_meta, t.idioma as template_idioma,
            t.status_meta as template_status_meta
     from public.avisos a
     left join public.profiles p on p.id = a.cobrador_id
     left join lateral (
       select t.conteudo, t.variaveis, t.nome_meta, t.idioma, t.status_meta
       from public.templates t
       where t.chave = 'ciclo.' || $2 and t.ativo
         and t.contexto in (
           'padrao'::template_contexto,
           (case when a.status = 'informado_pago' then 'revisao' else 'padrao' end)::template_contexto
         )
       order by (t.contexto = (case when a.status = 'informado_pago' then 'revisao' else 'padrao' end)::template_contexto) desc
       limit 1
     ) t on true
     where a.id = $1`,
    [avisoId, etapa],
  )
  if (!rows[0]) return null
  return { ...rows[0], valor_centavos: Number(rows[0].valor_centavos) }
}

export async function marcarEnviado(pool: Pool, envioId: string, wamid: string): Promise<void> {
  await pool.query(
    `update public.envios set status='enviado', enviado_em=now(), wamid=$2, erro=null where id=$1`,
    [envioId, wamid],
  )
}

export async function marcarCancelado(pool: Pool, envioId: string, erro: string): Promise<void> {
  await pool.query(`update public.envios set status='cancelado', erro=$2 where id=$1`, [envioId, erro])
}

/**
 * Cancela um envio por coalescing/obsolescência (estado terminal/superado, H10.9) e
 * AUDITA em eventos_aviso (append-only, M5), sem PII. Idempotente: só audita se a linha
 * ainda não estava cancelada. Mesma disciplina do drainer de notificações.
 */
export async function marcarCanceladoAuditado(
  pool: Pool,
  envioId: string,
  avisoId: string,
  etapa: EtapaEnvio,
  motivo: string,
): Promise<void> {
  const cli = await pool.connect()
  try {
    await cli.query('begin')
    const { rowCount } = await cli.query(
      `update public.envios set status='cancelado', erro=$2 where id=$1 and status <> 'cancelado'`,
      [envioId, motivo],
    )
    if ((rowCount ?? 0) > 0) {
      await cli.query(
        `insert into public.eventos_aviso (aviso_id, tipo, ator, detalhes)
         values ($1, 'notificacao_coalescida', 'sistema', jsonb_build_object('envio', $2::text, 'motivo', $3::text))`,
        [avisoId, etapa, motivo],
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

export async function marcarFalhou(pool: Pool, envioId: string, erro: string): Promise<void> {
  await pool.query(
    `update public.envios set status='falhou', tentativas=tentativas+1, erro=$2 where id=$1`,
    [envioId, erro],
  )
}

/**
 * Falha transitória: reagenda com intervalo aleatório 20-60s (shared/retry), ou falha
 * definitivamente após MAX_TENTATIVAS (exatamente 3 tentativas, H6.8). Mesma política
 * do notificar_cobrador (centralizada em shared/retry; antes era backoff em minutos).
 */
export async function reagendarOuFalhar(
  pool: Pool,
  envioId: string,
  tentativasAtuais: number,
  erro: string,
): Promise<'reagendado' | 'falhou'> {
  const d = decidirReagendamento(tentativasAtuais)
  if (d.acao === 'falhou') {
    await marcarFalhou(pool, envioId, erro)
    return 'falhou'
  }
  await pool.query(
    `update public.envios
       set status='agendado', tentativas=$2, proxima_tentativa_em=now() + ($3 || ' seconds')::interval, erro=$4
     where id=$1`,
    [envioId, d.proxima, String(d.segundos), erro],
  )
  return 'reagendado'
}
