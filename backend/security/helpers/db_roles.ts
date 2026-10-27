// comoRole: executa uma funcao como um role de servico, via SET LOCAL ROLE dentro de uma
// transacao descartavel (SEC-021..033). O SET LOCAL + ROLLBACK no finally garante que o role
// nunca "vaza" para a conexao seguinte do pool e que nada que o teste fizer suja o banco.
//
// Conecta como superusuario de teste e troca de role com SET ROLE. anon/authenticated sao
// NOLOGIN (so alcancaveis por SET ROLE); os whaviso_* sao nobypassrls, entao RLS + grants
// valem de verdade sob o role (o superusuario os ignoraria).
import type { PoolClient } from 'pg'
import { poolSuper } from './conexao'

export type RoleServico = 'whaviso_api' | 'whaviso_zap' | 'whaviso_atendente'
export type RoleSuporte = 'anon' | 'authenticated'
export type Role = RoleServico | RoleSuporte

export const ROLES_SERVICO: readonly RoleServico[] = ['whaviso_api', 'whaviso_zap', 'whaviso_atendente']
const ROLES_PERMITIDOS = new Set<Role>([...ROLES_SERVICO, 'anon', 'authenticated'])

/**
 * Abre transacao, faz `SET LOCAL ROLE <role>` e entrega o client a `fn`. Sempre ROLLBACK no
 * finally (reseta o role e descarta qualquer efeito). Rejeita role fora da lista fechada.
 */
export async function comoRole<T>(role: Role, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!ROLES_PERMITIDOS.has(role)) {
    throw new Error(`role nao permitido no harness: "${role}"`)
  }
  const client = await poolSuper.connect()
  try {
    await client.query('begin')
    // role vem da allowlist fechada acima; identificador entre aspas duplas.
    await client.query(`set local role "${role}"`)
    return await fn(client)
  } finally {
    await client.query('rollback').catch(() => {})
    client.release()
  }
}

/** Codigo SQLSTATE de "privilegio insuficiente" (grant por tabela/coluna ou trigger append-only). */
export const PRIVILEGIO_INSUFICIENTE = '42501'

export interface ResultadoOperacao {
  ok: boolean
  /** SQLSTATE quando a operacao falhou (ex.: '42501'). */
  code?: string
  /** Mensagem do erro (sem segredo; usada so para diagnostico de falha de teste). */
  mensagem?: string
}

/**
 * Executa um comando SQL como `role` e devolve se passou ou o SQLSTATE do erro, sem lancar.
 * O erro e capturado DENTRO da transacao; comoRole faz o rollback de qualquer jeito.
 */
export async function operarComoRole(role: Role, sqlText: string): Promise<ResultadoOperacao> {
  return comoRole(role, async (client) => {
    try {
      await client.query(sqlText)
      return { ok: true }
    } catch (erro) {
      const e = erro as { code?: string; message?: string }
      return { ok: false, code: e.code, mensagem: e.message }
    }
  })
}
