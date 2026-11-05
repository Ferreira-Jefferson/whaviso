// Acesso a dados do kernel de acesso assistido: SO via @whaviso/shared/db, sempre com sql`...`
// (parametrizado), colunas sempre explicitas (curinga proibido). Este kernel e o UNICO dono das
// tabelas `acessos_suporte` e `acessos_suporte_log` na api: nenhum modulo escreve nelas direto.
// Sem DELETE (SEC-030); o log e append-only (so insert). Nunca persiste PII/conteudo: `acao` e
// `recurso` sao rotulos (ex.: 'conversas:listar'), nunca telefone, Pix nem o texto em si.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import type { AcessoSuporte } from '@whaviso/shared/contracts'

/** Renderiza um timestamptz como ISO 8601 UTC (contrato de borda). */
const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

// Projecao publica unica do grant, com `ativo` derivado (revogado_em null e now < expira_em).
const COLS = sql`
  id, loja_id, chamado_id, concedido_por, motivo,
  ${TS('criado_em')} as criado_em, ${TS('expira_em')} as expira_em,
  ${TS('revogado_em')} as revogado_em, revogado_por,
  (revogado_em is null and now() < expira_em) as ativo`

export interface DadosConcessao {
  lojaId: string
  concedidoPor: string
  motivo: string | null
  expiraEm: string
  chamadoId: string | null
}

/** Insere o grant. Devolve a linha ja com `ativo` derivado. */
export async function inserir(exec: Executor, d: DadosConcessao): Promise<AcessoSuporte> {
  const linha = await consultarUm<AcessoSuporte>(
    exec,
    sql`insert into public.acessos_suporte
          (loja_id, chamado_id, concedido_por, motivo, expira_em)
        values (${d.lojaId}, ${d.chamadoId}, ${d.concedidoPor}, ${d.motivo}, ${d.expiraEm}::timestamptz)
        returning ${COLS}`,
  )
  // RETURNING sempre devolve a linha recem-inserida.
  return linha!
}

/** Grants da loja (ativos e passados), mais recentes primeiro. */
export async function listarPorLoja(exec: Executor, lojaId: string): Promise<AcessoSuporte[]> {
  return consultar<AcessoSuporte>(
    exec,
    sql`select ${COLS} from public.acessos_suporte
         where loja_id = ${lojaId} order by criado_em desc, id desc`,
  )
}

/** Um grant por id, restrito a loja (isolamento multi-tenant). */
export async function buscarPorId(
  exec: Executor,
  id: string,
  lojaId: string,
): Promise<AcessoSuporte | null> {
  return consultarUm<AcessoSuporte>(
    exec,
    sql`select ${COLS} from public.acessos_suporte where id = ${id} and loja_id = ${lojaId}`,
  )
}

/** Grant ativo da loja (revogado_em null e now < expira_em), se houver. Uso da ponte. */
export async function ativoDaLoja(exec: Executor, lojaId: string): Promise<AcessoSuporte | null> {
  return consultarUm<AcessoSuporte>(
    exec,
    sql`select ${COLS} from public.acessos_suporte
         where loja_id = ${lojaId} and revogado_em is null and now() < expira_em
         order by expira_em desc, id desc limit 1`,
  )
}

/**
 * Revoga (idempotente): so marca se ainda estiver ativo. Devolve a linha atual (revogada ou nao),
 * ou null se o grant nao pertence a loja. O `where revogado_em is null` evita sobrescrever quem
 * revogou/expirou antes.
 */
export async function revogar(
  exec: Executor,
  id: string,
  lojaId: string,
  revogadoPor: string,
): Promise<AcessoSuporte | null> {
  const atualizado = await consultarUm<AcessoSuporte>(
    exec,
    sql`update public.acessos_suporte
           set revogado_em = now(), revogado_por = ${revogadoPor}
         where id = ${id} and loja_id = ${lojaId} and revogado_em is null
         returning ${COLS}`,
  )
  if (atualizado) return atualizado
  // Ja estava revogado (ou nao existe nesta loja): idempotente, devolve o estado atual.
  return buscarPorId(exec, id, lojaId)
}

export interface DadosUso {
  acessoId: string | null
  operadorUserId: string
  lojaId: string
  acao: string
  recurso: string | null
}

/** Append-only: registra uma leitura de conteudo pelo operador na sessao assistida. */
export async function registrarUso(exec: Executor, d: DadosUso): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.acessos_suporte_log
          (acesso_id, operador_user_id, loja_id, acao, recurso)
        values (${d.acessoId}, ${d.operadorUserId}, ${d.lojaId}, ${d.acao}, ${d.recurso})`,
  )
}
