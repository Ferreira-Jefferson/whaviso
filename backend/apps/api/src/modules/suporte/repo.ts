// Acesso a dados do modulo `suporte`: SO via @whaviso/shared/db, sempre com sql`...`
// (parametrizado), colunas explicitas (curinga proibido). Dono UNICO das tabelas
// `chamados_suporte` e `chamados_suporte_mensagens`. NAO toca `acessos_suporte*` (do kernel
// shared/acesso_suporte): fronteira feature-first. Sem DELETE (SEC-030); mensagens append-only.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import type { ChamadoMensagem, ChamadoResumo, StatusChamado } from '@whaviso/shared/contracts'

/** Renderiza um timestamptz como ISO 8601 UTC (contrato de borda). */
const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

const COLS_CHAMADO = sql`
  id, loja_id, assunto, status,
  ${TS('criado_em')} as criado_em, ${TS('atualizado_em')} as atualizado_em`

const COLS_MSG = sql`
  id, chamado_id, autor_tipo, autor_user_id, texto, ${TS('criado_em')} as criado_em`

// ------------------------------------------------------------------ chamados
export async function inserirChamado(
  exec: Executor,
  d: { lojaId: string; assunto: string; criadoPor: string },
): Promise<ChamadoResumo> {
  const linha = await consultarUm<ChamadoResumo>(
    exec,
    sql`insert into public.chamados_suporte (loja_id, assunto, criado_por)
        values (${d.lojaId}, ${d.assunto}, ${d.criadoPor})
        returning ${COLS_CHAMADO}`,
  )
  return linha!
}

/** Chamados da loja, mais recentes primeiro. */
export function listarPorLoja(exec: Executor, lojaId: string): Promise<ChamadoResumo[]> {
  return consultar<ChamadoResumo>(
    exec,
    sql`select ${COLS_CHAMADO} from public.chamados_suporte
         where loja_id = ${lojaId} order by criado_em desc, id desc`,
  )
}

/** Um chamado da loja (isolamento multi-tenant); null se fora da loja. */
export function buscarPorIdNaLoja(
  exec: Executor,
  id: string,
  lojaId: string,
): Promise<ChamadoResumo | null> {
  return consultarUm<ChamadoResumo>(
    exec,
    sql`select ${COLS_CHAMADO} from public.chamados_suporte where id = ${id} and loja_id = ${lojaId}`,
  )
}

/** Um chamado por id, SEM restricao de tenant. Uso exclusivo do CONSOLE (global por desenho). */
export function buscarPorId(exec: Executor, id: string): Promise<ChamadoResumo | null> {
  return consultarUm<ChamadoResumo>(
    exec,
    sql`select ${COLS_CHAMADO} from public.chamados_suporte where id = ${id}`,
  )
}

/** Atualiza o status do chamado (toca atualizado_em via trigger). Restrito por loja se informada. */
export async function atualizarStatus(
  exec: Executor,
  id: string,
  status: StatusChamado,
  lojaId: string | null,
): Promise<ChamadoResumo | null> {
  const porLoja = lojaId === null ? sqlBruto('') : sql` and loja_id = ${lojaId}`
  return consultarUm<ChamadoResumo>(
    exec,
    sql`update public.chamados_suporte set status = ${status}
         where id = ${id}${porLoja} returning ${COLS_CHAMADO}`,
  )
}

export interface FiltroFila {
  status: StatusChamado | null
  apos: { instante: string; id: string } | null
  limite: number
}

/** Fila do console: todos os chamados (todas as lojas), por atualizado_em desc. `limite + 1`. */
export function listarFila(exec: Executor, f: FiltroFila): Promise<ChamadoResumo[]> {
  return consultar<ChamadoResumo>(
    exec,
    sql`select ${COLS_CHAMADO} from public.chamados_suporte
         where (${f.status}::text is null or status::text = ${f.status})
           and (${f.apos?.instante ?? null}::timestamptz is null
                or (atualizado_em, id) < (${f.apos?.instante ?? null}::timestamptz, ${f.apos?.id ?? null}::uuid))
         order by atualizado_em desc, id desc
         limit ${f.limite + 1}`,
  )
}

// ------------------------------------------------------------------ mensagens
export async function inserirMensagem(
  exec: Executor,
  d: { chamadoId: string; autorTipo: 'loja' | 'operador'; autorUserId: string; texto: string },
): Promise<ChamadoMensagem> {
  const linha = await consultarUm<ChamadoMensagem>(
    exec,
    sql`insert into public.chamados_suporte_mensagens (chamado_id, autor_tipo, autor_user_id, texto)
        values (${d.chamadoId}, ${d.autorTipo}, ${d.autorUserId}, ${d.texto})
        returning ${COLS_MSG}`,
  )
  return linha!
}

/** Mensagens do chamado em ordem cronologica. */
export function mensagensDoChamado(exec: Executor, chamadoId: string): Promise<ChamadoMensagem[]> {
  return consultar<ChamadoMensagem>(
    exec,
    sql`select ${COLS_MSG} from public.chamados_suporte_mensagens
         where chamado_id = ${chamadoId} order by criado_em asc, id asc`,
  )
}
