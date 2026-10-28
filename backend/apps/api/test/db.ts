// Harness de banco para os testes de integracao de seguranca (F3). Dois pools:
//   - poolSuper (postgres): semeia auth.users/contas/lojas/membros/operadores (FK exige super).
//   - poolApi (whaviso_api): roda o LeitorEscopo sob o role de menor privilegio real.
// Roda SEMPRE no Postgres LOCAL whaviso_dev (ver apps/api/vitest.config.ts). Se o banco
// nao estiver acessivel, `bancoAcessivel()` devolve false e a suite se pula com aviso.
import { randomUUID } from 'node:crypto'
import { criarPool, criarPoolSuper } from '../../../test-support/banco'

export const poolSuper = criarPoolSuper(3)
export const poolApi = criarPool('whaviso_api', 'whaviso_api_dev', 3)

export async function bancoAcessivel(): Promise<boolean> {
  try {
    await poolApi.query('select 1')
    await poolSuper.query('select 1')
    return true
  } catch {
    return false
  }
}

export async function fecharPools(): Promise<void> {
  await poolApi.end().catch(() => {})
  await poolSuper.end().catch(() => {})
}

/** Ids criados por um cenario, para limpeza determinista. */
export interface Cenario {
  usuarios: string[]
  contas: string[]
}

export function novoCenario(): Cenario {
  return { usuarios: [], contas: [] }
}

export async function criarUsuario(c: Cenario): Promise<string> {
  const id = randomUUID()
  await poolSuper.query('insert into auth.users (id) values ($1)', [id])
  c.usuarios.push(id)
  return id
}

export async function criarConta(c: Cenario, donoUserId: string): Promise<string> {
  const id = randomUUID()
  await poolSuper.query(
    'insert into public.contas (id, dono_user_id, nome) values ($1, $2, $3)',
    [id, donoUserId, 'Conta de teste'],
  )
  c.contas.push(id)
  return id
}

export async function criarLoja(contaId: string, ativo = true): Promise<string> {
  const id = randomUUID()
  await poolSuper.query(
    'insert into public.lojas (id, conta_id, nome, ativo) values ($1, $2, $3, $4)',
    [id, contaId, 'Loja de teste', ativo],
  )
  return id
}

type Papel = 'dono' | 'gerente' | 'atendente'

export async function criarMembro(
  contaId: string,
  userId: string,
  papel: Papel,
  lojaId: string | null,
  ativo = true,
): Promise<string> {
  const id = randomUUID()
  await poolSuper.query(
    'insert into public.membros (id, conta_id, loja_id, user_id, papel, ativo) values ($1,$2,$3,$4,$5,$6)',
    [id, contaId, lojaId, userId, papel, ativo],
  )
  return id
}

export async function criarOperador(
  userId: string,
  papel: 'operador' | 'admin' = 'operador',
): Promise<string> {
  const id = randomUUID()
  await poolSuper.query(
    'insert into public.operadores (id, user_id, nome, papel) values ($1,$2,$3,$4)',
    [id, userId, 'Operador de teste', papel],
  )
  return id
}

export async function contarOperadores(userId: string): Promise<number> {
  const { rows } = await poolSuper.query<{ n: string }>(
    'select count(*)::text as n from public.operadores where user_id = $1',
    [userId],
  )
  return Number(rows[0]!.n)
}

export async function desativarMembro(membroId: string): Promise<void> {
  await poolSuper.query('update public.membros set ativo = false where id = $1', [membroId])
}

/** Remove tudo que o cenario criou (ordem respeita as FKs). */
export async function limpar(c: Cenario): Promise<void> {
  for (const contaId of c.contas) {
    // lojas e membros cascateiam da conta.
    await poolSuper.query('delete from public.contas where id = $1', [contaId]).catch(() => {})
  }
  for (const userId of c.usuarios) {
    await poolSuper.query('delete from public.operadores where user_id = $1', [userId]).catch(() => {})
    await poolSuper.query('delete from auth.users where id = $1', [userId]).catch(() => {})
  }
}
