// Acesso a dados do modulo: SO via @whaviso/shared/db, sempre com sql`...` (parametrizado).
// Toda consulta filtra por loja_id. O grafo e configuracao da loja (sem PII), mas nunca vai para log.
import { consultar, consultarUm, sql, sqlBruto, type Consulta, type Executor } from '@whaviso/shared/db'
import type { FluxoGrafo, FluxoVersaoDto } from './schemas'

const TS = (col: string): Consulta =>
  sqlBruto(`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`)

export interface FluxoLinha {
  id: string
  nome: string
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

export interface VersaoLinha {
  id: string
  versao: number
  status: 'rascunho' | 'publicada' | 'arquivada'
  grafo: FluxoGrafo
  publicada_em: string | null
  criado_em: string
  atualizado_em: string
}

const COLS_FLUXO = sql`id, nome, ativo, ${TS('criado_em')} as criado_em, ${TS('atualizado_em')} as atualizado_em`
const COLS_VERSAO = sql`id, versao, status, grafo, ${TS('publicada_em')} as publicada_em,
  ${TS('criado_em')} as criado_em, ${TS('atualizado_em')} as atualizado_em`

export const paraDto = (v: VersaoLinha): FluxoVersaoDto => ({
  id: v.id, versao: v.versao, status: v.status, grafo: v.grafo,
  publicada_em: v.publicada_em, criado_em: v.criado_em, atualizado_em: v.atualizado_em,
})

export async function listarFluxos(exec: Executor, lojaId: string) {
  return consultar<FluxoLinha & { versao_publicada: number | null; tem_rascunho: boolean }>(
    exec,
    sql`select f.id, f.nome, f.ativo, ${TS('f.criado_em')} as criado_em,
               (select v.versao from public.fluxo_versoes v where v.fluxo_id = f.id and v.status = 'publicada') as versao_publicada,
               exists (select 1 from public.fluxo_versoes v where v.fluxo_id = f.id and v.status = 'rascunho') as tem_rascunho
          from public.fluxos f
         where f.loja_id = ${lojaId}
         order by f.criado_em desc, f.id`,
  )
}

export async function obterFluxo(exec: Executor, lojaId: string, id: string) {
  return consultarUm<FluxoLinha>(
    exec,
    sql`select ${COLS_FLUXO} from public.fluxos where loja_id = ${lojaId} and id = ${id}`,
  )
}

/** Trava o fluxo (serializa salvar/publicar/ativar concorrentes). */
export async function travarFluxo(exec: Executor, lojaId: string, id: string) {
  return consultarUm<FluxoLinha>(
    exec,
    sql`select ${COLS_FLUXO} from public.fluxos where loja_id = ${lojaId} and id = ${id} for update`,
  )
}

export async function inserirFluxo(exec: Executor, lojaId: string, nome: string) {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.fluxos (loja_id, nome) values (${lojaId}, ${nome}) returning id`,
  )
  return r!.id
}

export async function versaoPorStatus(
  exec: Executor, lojaId: string, fluxoId: string, status: 'rascunho' | 'publicada',
) {
  return consultarUm<VersaoLinha>(
    exec,
    sql`select ${COLS_VERSAO} from public.fluxo_versoes
         where loja_id = ${lojaId} and fluxo_id = ${fluxoId} and status = ${status}`,
  )
}

export async function versaoPorNumero(exec: Executor, lojaId: string, fluxoId: string, numero: number) {
  return consultarUm<VersaoLinha>(
    exec,
    sql`select ${COLS_VERSAO} from public.fluxo_versoes
         where loja_id = ${lojaId} and fluxo_id = ${fluxoId} and versao = ${numero}`,
  )
}

export async function listarVersoes(exec: Executor, lojaId: string, fluxoId: string) {
  return consultar<Omit<VersaoLinha, 'grafo'>>(
    exec,
    sql`select id, versao, status, ${TS('publicada_em')} as publicada_em,
               ${TS('criado_em')} as criado_em, ${TS('atualizado_em')} as atualizado_em
          from public.fluxo_versoes
         where loja_id = ${lojaId} and fluxo_id = ${fluxoId}
         order by versao desc`,
  )
}

export async function inserirRascunho(
  exec: Executor, lojaId: string, fluxoId: string, grafo: FluxoGrafo, userId: string,
) {
  const r = await consultarUm<{ versao: number }>(
    exec,
    sql`insert into public.fluxo_versoes (fluxo_id, loja_id, versao, status, grafo, criado_por)
        values (${fluxoId}, ${lojaId},
                (select coalesce(max(versao), 0) + 1 from public.fluxo_versoes where fluxo_id = ${fluxoId}),
                'rascunho', ${JSON.stringify(grafo)}::jsonb, ${userId})
        returning versao`,
  )
  return r!.versao
}

export async function atualizarRascunho(exec: Executor, lojaId: string, versaoId: string, grafo: FluxoGrafo) {
  await consultar(
    exec,
    sql`update public.fluxo_versoes set grafo = ${JSON.stringify(grafo)}::jsonb, atualizado_em = now()
         where id = ${versaoId} and loja_id = ${lojaId} and status = 'rascunho'`,
  )
}

/** Arquiva a publicada vigente (se houver) e publica o rascunho. Chamar com o fluxo travado. */
export async function publicarRascunho(exec: Executor, lojaId: string, fluxoId: string, rascunhoId: string) {
  await consultar(
    exec,
    sql`update public.fluxo_versoes set status = 'arquivada', atualizado_em = now()
         where fluxo_id = ${fluxoId} and loja_id = ${lojaId} and status = 'publicada'`,
  )
  await consultar(
    exec,
    sql`update public.fluxo_versoes set status = 'publicada', publicada_em = now(), atualizado_em = now()
         where id = ${rascunhoId} and loja_id = ${lojaId} and status = 'rascunho'`,
  )
  await consultar(exec, sql`update public.fluxos set atualizado_em = now() where id = ${fluxoId} and loja_id = ${lojaId}`)
}

/** Ativa o fluxo e desativa os demais da loja (no maximo um ativo). */
export async function definirAtivo(exec: Executor, lojaId: string, fluxoId: string, ativo: boolean) {
  if (ativo) {
    await consultar(
      exec,
      sql`update public.fluxos set ativo = false, atualizado_em = now()
           where loja_id = ${lojaId} and ativo and id <> ${fluxoId}`,
    )
  }
  await consultar(
    exec,
    sql`update public.fluxos set ativo = ${ativo}, atualizado_em = now()
         where loja_id = ${lojaId} and id = ${fluxoId}`,
  )
}

/** Evento de auditoria sem PII e sem o grafo: so ids e numeros. */
export async function registrarEvento(
  exec: Executor,
  e: { lojaId: string; tipo: string; fluxoId: string; userId: string; versao?: number },
) {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (${e.lojaId}, ${e.tipo}, 'fluxo', ${e.fluxoId}, 'loja',
                ${JSON.stringify({ user_id: e.userId, ...(e.versao ? { versao: e.versao } : {}) })}::jsonb)`,
  )
}
