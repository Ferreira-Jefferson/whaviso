// Acesso a dados do modulo campanhas. Dono de `campanhas` e `campanha_envios`; produz na outbox
// `envios` (enfileira; nunca fala com a Meta nem importa o zap). Le o publico-alvo da view
// clientes_metricas (REUSO do filtro de opt-out do CRM) e `templates` (mesmo criterio de ativo que
// o zap). Toda consulta filtra por loja_id (SEC-110). Nunca seleciona telefone em claro (so o hash,
// e so para popular `envios.destinatario_hash`); nenhum telefone/hash vai a log.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

export interface CampanhaLinha {
  id: string
  nome: string
  template_chave: string
  numero_whatsapp_id: string
  filtro: { segmento?: string }
  variaveis: Record<string, string>
  status: 'rascunho' | 'enfileirada' | 'cancelada'
  total_destinatarios: number
  enfileirado_em: string | null
  criado_em: string
}

const COLS = sql`id, nome, template_chave, numero_whatsapp_id, filtro, variaveis, status::text as status,
  total_destinatarios, ${TS('enfileirado_em')} as enfileirado_em, ${TS('criado_em')} as criado_em`

export async function criar(
  exec: Executor,
  d: {
    lojaId: string
    nome: string
    templateChave: string
    numeroId: string
    segmento: string | null
    variaveis: Record<string, string>
    userId: string
  },
): Promise<CampanhaLinha> {
  const filtro = d.segmento ? JSON.stringify({ segmento: d.segmento }) : '{}'
  const r = await consultarUm<CampanhaLinha>(
    exec,
    sql`insert into public.campanhas
          (loja_id, nome, template_chave, numero_whatsapp_id, filtro, variaveis, criado_por_user_id)
        values (${d.lojaId}, ${d.nome}, ${d.templateChave}, ${d.numeroId}, ${filtro}::jsonb,
                ${JSON.stringify(d.variaveis)}::jsonb, ${d.userId})
        returning ${COLS}`,
  )
  return r!
}

export async function listar(exec: Executor, lojaId: string): Promise<CampanhaLinha[]> {
  return consultar<CampanhaLinha>(
    exec,
    sql`select ${COLS} from public.campanhas
         where loja_id = ${lojaId}
         order by criado_em desc, id desc
         limit 200`,
  )
}

export async function obter(exec: Executor, lojaId: string, id: string): Promise<CampanhaLinha | null> {
  return consultarUm<CampanhaLinha>(
    exec,
    sql`select ${COLS} from public.campanhas where loja_id = ${lojaId} and id = ${id}`,
  )
}

/** Trava a campanha para disparar/cancelar (evita disparo concorrente duplo). */
export async function travar(exec: Executor, lojaId: string, id: string): Promise<CampanhaLinha | null> {
  return consultarUm<CampanhaLinha>(
    exec,
    sql`select ${COLS} from public.campanhas where loja_id = ${lojaId} and id = ${id} for update`,
  )
}

/** Numero de origem conectado da loja (SEC-110: so numero da propria loja). */
export async function numeroConectado(exec: Executor, lojaId: string, numeroId: string): Promise<boolean> {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`select id from public.numeros_whatsapp
         where id = ${numeroId} and loja_id = ${lojaId} and status = 'conectado'`,
  )
  return r != null
}

export interface TemplateLinha {
  nome_meta: string
  idioma: string
  variaveis: string[]
  status_meta: string
}

/** Template ativo da loja (override da loja ou padrao da plataforma), mesmo criterio do zap. */
export async function templateAtivo(
  exec: Executor,
  lojaId: string,
  chave: string,
): Promise<TemplateLinha | null> {
  return consultarUm<TemplateLinha>(
    exec,
    sql`select nome_meta, idioma, variaveis, status_meta::text as status_meta
          from public.templates
         where chave = ${chave} and ativo and (loja_id = ${lojaId} or loja_id is null)
         order by loja_id nulls last
         limit 1`,
  )
}

/** Fragmento do filtro de segmento (o opt-out e sempre excluido fora daqui). */
function filtroSegmento(segmento: string | null): Consulta {
  return segmento ? sql` and m.segmento = ${segmento}` : sqlBruto('')
}

/**
 * Conta o publico-alvo: clientes da loja SEM opt-out (REUSO do criterio `contactavel` do CRM:
 * `clientes_metricas.opt_out_marketing = false`), opcionalmente por segmento.
 */
export async function contarDestinatarios(
  exec: Executor,
  lojaId: string,
  segmento: string | null,
): Promise<number> {
  const r = await consultarUm<{ n: number }>(
    exec,
    sql`select count(*)::int as n
          from public.clientes_metricas m
         where m.loja_id = ${lojaId} and m.opt_out_marketing = false${filtroSegmento(segmento)}`,
  )
  return r?.n ?? 0
}

/**
 * Enfileira a campanha na outbox `envios` (sempre TEMPLATE; caminho sancionado fora da janela de
 * 24h, SEC-111) e registra o par (campanha, cliente) em `campanha_envios`, num unico passo:
 *   1. alvo: clientes da loja sem opt-out (view clientes_metricas) + telefone_hash (de `clientes`)
 *      + `anteriores`: quantas mensagens de OUTRAS campanhas o cliente ja recebeu na janela da loja
 *      (`lojas.campanha_freq_janela_dias`), contando so envios vivos (nem cancelado nem falhou).
 *   2. elegivel: `campanha_freq_max` nulo (sem limite) ou anteriores < maximo. Quem ja atingiu o
 *      maximo e SUPRIMIDO: vira linha `suprimido_frequencia` em campanha_envios (sem outbox), sem
 *      bloquear os demais.
 *   3. ins_envio: insere na outbox os elegiveis, com dedupe por (numero, 'campanha:<id>:<cliente>').
 *   4. campanha_envios: liga cada envio criado ao par (status enfileirado) e grava os suprimidos.
 * Devolve quantos foram enfileirados e quantos suprimidos por frequencia. O payload de template e
 * fixo (mesmo p/ todos). Tudo escopado por loja_id (SEC-110).
 */
export async function enfileirar(
  exec: Executor,
  d: {
    campanhaId: string
    lojaId: string
    numeroId: string
    templateChave: string
    segmento: string | null
    variaveis: Record<string, string>
  },
): Promise<{ enfileirados: number; suprimidos: number }> {
  const payload = JSON.stringify({ tipo: 'template', template: d.templateChave, variaveis: d.variaveis })
  const r = await consultarUm<{ enfileirados: number; suprimidos: number }>(
    exec,
    sql`with cfg as (
           select campanha_freq_max as maximo, campanha_freq_janela_dias as janela_dias
             from public.lojas where id = ${d.lojaId}
         ),
         alvo as (
           select m.cliente_id, c.telefone_hash,
                  (cfg.maximo is null or coalesce(p.n, 0) < cfg.maximo) as elegivel
             from public.clientes_metricas m
             join public.clientes c on c.id = m.cliente_id and c.loja_id = m.loja_id
             cross join cfg
             left join lateral (
               select count(*)::int as n
                 from public.campanha_envios ce2
                 join public.envios e2 on e2.id = ce2.envio_id and e2.loja_id = ce2.loja_id
                where ce2.loja_id = m.loja_id and ce2.cliente_id = m.cliente_id
                  and ce2.campanha_id <> ${d.campanhaId}
                  and ce2.status = 'enfileirado'
                  and e2.status not in ('cancelado', 'falhou')
                  and ce2.criado_em >= now() - make_interval(days => cfg.janela_dias)
             ) p on true
            where m.loja_id = ${d.lojaId} and m.opt_out_marketing = false${filtroSegmento(d.segmento)}
         ),
         ins_envio as (
           insert into public.envios
             (loja_id, numero_whatsapp_id, cliente_id, destinatario_hash, template_chave, payload, dedupe_chave)
           select ${d.lojaId}, ${d.numeroId}, a.cliente_id, a.telefone_hash, ${d.templateChave},
                  ${payload}::jsonb, 'campanha:' || ${d.campanhaId}::text || ':' || a.cliente_id::text
             from alvo a
            where a.elegivel
           on conflict (numero_whatsapp_id, dedupe_chave) where dedupe_chave is not null do nothing
           returning id, cliente_id
         ),
         ins_ce as (
           insert into public.campanha_envios (campanha_id, loja_id, cliente_id, envio_id, status)
           select ${d.campanhaId}, ${d.lojaId}, ie.cliente_id, ie.id, 'enfileirado'
             from ins_envio ie
           on conflict (campanha_id, cliente_id) do nothing
           returning cliente_id
         ),
         ins_sup as (
           insert into public.campanha_envios (campanha_id, loja_id, cliente_id, envio_id, status)
           select ${d.campanhaId}, ${d.lojaId}, a.cliente_id, null, 'suprimido_frequencia'
             from alvo a
            where not a.elegivel
           on conflict (campanha_id, cliente_id) do nothing
           returning cliente_id
         )
         select (select count(*) from ins_ce)::int as enfileirados,
                (select count(*) from ins_sup)::int as suprimidos`,
  )
  return r ?? { enfileirados: 0, suprimidos: 0 }
}

/** Marca a campanha como enfileirada com o total efetivo. */
export async function marcarEnfileirada(
  exec: Executor,
  lojaId: string,
  id: string,
  total: number,
): Promise<void> {
  await consultar(
    exec,
    sql`update public.campanhas
           set status = 'enfileirada', total_destinatarios = ${total}, enfileirado_em = now()
         where loja_id = ${lojaId} and id = ${id}`,
  )
}

/**
 * Cancela a campanha: marca os envios ainda nao enviados como 'cancelado' na outbox (a api tem
 * update pleno em `envios`) e os pares correspondentes em `campanha_envios`. Envios ja enviados
 * nao voltam atras. Devolve quantos foram cancelados.
 */
export async function cancelar(exec: Executor, lojaId: string, id: string): Promise<number> {
  const linhas = await consultar<{ id: string }>(
    exec,
    sql`with alvo as (
           select ce.id as ce_id, e.id as envio_id
             from public.campanha_envios ce
             join public.envios e on e.id = ce.envio_id and e.loja_id = ce.loja_id
            where ce.loja_id = ${lojaId} and ce.campanha_id = ${id}
              and ce.status = 'enfileirado' and e.status in ('agendado', 'processando')
         ),
         can_env as (
           update public.envios e set status = 'cancelado'
             from alvo a where e.id = a.envio_id
           returning e.id
         )
         update public.campanha_envios ce set status = 'cancelado'
           from alvo a where ce.id = a.ce_id
         returning ce.id`,
  )
  await consultar(
    exec,
    sql`update public.campanhas set status = 'cancelada' where loja_id = ${lojaId} and id = ${id}`,
  )
  return linhas.length
}

export interface EntregaResumo {
  enfileirados: number
  enviados: number
  entregues: number
  lidos: number
  falhas: number
  cancelados: number
}

/** Agrega o estado de entrega da campanha a partir da outbox `envios` (lido por join). */
export async function entregaResumo(exec: Executor, lojaId: string, id: string): Promise<EntregaResumo> {
  const r = await consultarUm<EntregaResumo>(
    exec,
    sql`select
           count(*) filter (where ce.status = 'enfileirado')::int as enfileirados,
           count(*) filter (where e.entrega_status = 'sent'
                              or (e.status = 'enviado' and e.entrega_status is null))::int as enviados,
           count(*) filter (where e.entrega_status = 'delivered')::int as entregues,
           count(*) filter (where e.entrega_status = 'read')::int as lidos,
           count(*) filter (where e.status = 'falhou' or e.entrega_status = 'failed')::int as falhas,
           count(*) filter (where ce.status = 'cancelado' or e.status = 'cancelado')::int as cancelados
          from public.campanha_envios ce
          left join public.envios e on e.id = ce.envio_id and e.loja_id = ce.loja_id
         where ce.loja_id = ${lojaId} and ce.campanha_id = ${id}`,
  )
  return r ?? { enfileirados: 0, enviados: 0, entregues: 0, lidos: 0, falhas: 0, cancelados: 0 }
}

/** Auditoria append-only sem PII (tabela eventos): so ids e o total. */
export async function registrarEvento(
  exec: Executor,
  e: { lojaId: string; tipo: string; campanhaId: string; userId: string; detalhes?: Record<string, unknown> },
): Promise<void> {
  const detalhes = JSON.stringify({ user_id: e.userId, ...e.detalhes })
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, ${e.tipo}, 'campanha', ${e.campanhaId}, 'loja', ${detalhes}::jsonb)`,
  )
}
