// Escrita do modulo: `operadores` (equipe Whaviso), o provisionamento de cliente (contas, lojas,
// membros: so INSERT, sem DELETE) e o registro em `eventos`.
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

/** Provisiona o cliente: conta + primeira loja + dono (membro de todas as lojas). Cruza por banco. */
export async function inserirContaCliente(
  exec: Executor,
  d: { donoUserId: string; nomeRestaurante: string },
): Promise<{ contaId: string; lojaId: string; membroId: string }> {
  const conta = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.contas (dono_user_id, nome) values (${d.donoUserId}, ${d.nomeRestaurante}) returning id`,
  )
  const loja = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.lojas (conta_id, nome) values (${conta!.id}, ${d.nomeRestaurante}) returning id`,
  )
  const membro = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.membros (conta_id, loja_id, user_id, papel)
        values (${conta!.id}, null, ${d.donoUserId}, 'dono'::papel_membro) returning id`,
  )
  return { contaId: conta!.id, lojaId: loja!.id, membroId: membro!.id }
}

/** Serializa provisionamentos concorrentes do mesmo usuario (so vale dentro de transacao). */
export async function travarUsuario(exec: Executor, userId: string): Promise<void> {
  await consultar(exec, sql`select pg_advisory_xact_lock(hashtext(${userId}))`)
}

/** Auditoria (append-only). `detalhes` so com ids e papeis, nunca PII. Evento global (sem loja). */
export async function registrarEvento(
  exec: Executor,
  e: { tipo: string; entidade?: string; entidadeId: string; detalhes: Record<string, unknown> },
): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.eventos (loja_id, tipo, entidade, entidade_id, ator, detalhes)
        values (null, ${e.tipo}, ${e.entidade ?? 'operador'}, ${e.entidadeId}, 'operador', ${JSON.stringify(e.detalhes)}::jsonb)`,
  )
}
