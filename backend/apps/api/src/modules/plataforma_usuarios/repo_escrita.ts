// Escrita do modulo: `operadores` (equipe Whaviso), o cadastro de usuario (contas, lojas, membros,
// assinaturas: so INSERT, sem DELETE) e o registro em `eventos`.
// Sem DELETE (nao ha grant): operador sai da equipe com ativo = false.
import { consultar, consultarUm, sql, type Executor } from '@whaviso/shared/db'
import type { PapelMembro, PapelOperador } from '@whaviso/shared/contracts'
import type { OperadorLinha } from './repo'

const COLS = sql`id, user_id, nome, papel, ativo,
  to_char(criado_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as criado_em`

export async function inserirOperador(
  exec: Executor,
  d: { userId: string; nome: string; papel: PapelOperador },
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
  patch: { papel?: PapelOperador; ativo?: boolean },
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

/** Serializa cadastros concorrentes do mesmo usuario (so vale dentro de transacao). */
export async function travarUsuario(exec: Executor, userId: string): Promise<void> {
  await consultar(exec, sql`select pg_advisory_xact_lock(hashtext(${userId}))`)
}

/**
 * Serializa cadastros concorrentes do mesmo e-mail quando ainda nao ha user_id (pessoa nunca
 * logou): sem isso, dois POSTs simultaneos para o mesmo e-mail criariam duas contas.
 */
export async function travarEmail(exec: Executor, email: string): Promise<void> {
  await consultar(exec, sql`select pg_advisory_xact_lock(hashtext(lower(${email})))`)
}

/**
 * Cria uma conta nova. `donoUserId` null quando a pessoa ainda nunca logou no Whaviso: o vinculo
 * e feito depois, no primeiro login (bootstrap do modulo `conta`, usando a allowlist de login).
 */
export async function inserirConta(
  exec: Executor,
  d: { donoUserId: string | null; nome: string },
): Promise<{ id: string }> {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.contas (dono_user_id, nome) values (${d.donoUserId}, ${d.nome}) returning id`,
  )
  if (!r) throw new Error('insert de conta sem retorno')
  return r
}

/** Primeira loja da conta (so quando o dono ja existe: ele mesmo cria a loja via POST /v1/lojas
 * quando ainda nao tem conta no primeiro login). */
export async function inserirLoja(exec: Executor, d: { contaId: string; nome: string }): Promise<{ id: string }> {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.lojas (conta_id, nome) values (${d.contaId}, ${d.nome}) returning id`,
  )
  if (!r) throw new Error('insert de loja sem retorno')
  return r
}

/** Membro sempre ativo (o controle "ativo agora vs aguardando aprovacao" e so da allowlist de
 * login, que o shell confere a toda sessao: ver `definirAcessoAdmin`). */
export async function inserirMembro(
  exec: Executor,
  d: { contaId: string; lojaId: string | null; userId: string; papel: PapelMembro },
): Promise<{ id: string }> {
  const r = await consultarUm<{ id: string }>(
    exec,
    sql`insert into public.membros (conta_id, loja_id, user_id, papel)
        values (${d.contaId}, ${d.lojaId}, ${d.userId}, ${d.papel}::papel_membro)
        returning id`,
  )
  if (!r) throw new Error('insert de membro sem retorno')
  return r
}

/** Assinatura inicial da conta nova (status trial ate alguem confirmar o pagamento: P-cobranca). */
export async function inserirAssinaturaInicial(
  exec: Executor,
  d: { contaId: string; planoId: string; valorCentavos: number },
): Promise<void> {
  await consultar(
    exec,
    sql`insert into public.assinaturas (conta_id, loja_id, status, valor_mensal_centavos, plano_id)
        values (${d.contaId}, null, 'trial', ${d.valorCentavos}, ${d.planoId})`,
  )
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
