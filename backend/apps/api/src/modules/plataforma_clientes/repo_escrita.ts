// Escrita do modulo: SO a tabela `operadores` (equipe Whaviso) e o registro em `eventos`.
// Sem DELETE (nao ha grant): operador sai da equipe com ativo = false.
import { consultar, consultarUm, sql, type Executor } from '@whaviso/shared/db'
import type { OperadorLinha } from './repo'

const COLS = sql`id, user_id, nome, papel, ativo,
  to_char(criado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as criado_em`

export async function inserirOperador(
  exec: Executor,
  d: { userId: string; nome: string; papel: 'operador' | 'admin' },
): Promise<OperadorLinha> {
  const r = await consultarUm<OperadorLinha>(
    exec,
    sql`insert into public.operadores (user_id, nome, papel)
        values (${d.userId}, ${d.nome}, ${d.papel}::papel_operador)
        returning ${COLS}`,
  )
  if (!r) throw new Error('insert de operador sem retorno')
  return r
}

/** Trava as linhas de admin ativo (serializa mudancas concorrentes) e devolve seus ids. */
export async function travarAdminsAtivos(exec: Executor): Promise<string[]> {
  const linhas = await consultar<{ id: string }>(
    exec,
    sql`select id from public.operadores where papel = 'admin' and ativo order by id for update`,
  )
  return linhas.map((l) => l.id)
}

export async function obterOperadorPorId(exec: Executor, id: string): Promise<OperadorLinha | null> {
  return consultarUm<OperadorLinha>(exec, sql`select ${COLS} from public.operadores where id = ${id}`)
}

export async function atualizarOperador(
  exec: Executor,
  id: string,
  patch: { papel?: 'operador' | 'admin'; ativo?: boolean },
): Promise<OperadorLinha | null> {
  return consultarUm<OperadorLinha>(
    exec,
    sql`update public.operadores
           set papel = coalesce(${patch.papel ?? null}::papel_operador, papel),
               ativo = coalesce(${patch.ativo ?? null}::boolean, ativo)
         where id = ${id}
        returning ${COLS}`,
  )
}

/** Auditoria (append-only). `detalhes` so com ids e papeis, nunca PII. Evento global (sem loja). */
export async function registrarEvento(
  exec: Executor,
  e: { tipo: string; entidadeId: string; detalhes: Record<string, unknown> },
): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (null, ${e.tipo}, 'operador', ${e.entidadeId}, 'operador', ${JSON.stringify(e.detalhes)}::jsonb)`,
  )
}
