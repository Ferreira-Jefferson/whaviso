// Kernel compartilhado: gravação da AUDITORIA de autenticação (tabela eventos_auth,
// migration 0027). Vive em shared/ (módulo nunca importa módulo): `auth` e `aceite`
// gravam por aqui. Append-only no banco; aqui só inserimos.
//
// REGRA DE OURO: o telefone NUNCA entra em claro. Esta função recebe o telefone e
// guarda APENAS o sha256 hex. `detalhes` deve ser livre de PII (motivo, flags).
import type { Pool, PoolClient } from '@whaviso/shared/db'
import { sha256Hex } from '../tokens'

type Executor = Pool | PoolClient

export type TipoEventoAuth =
  | 'status_consultado'
  | 'otp_solicitado'
  | 'otp_entregue'
  | 'otp_falha_envio'
  | 'login_negado'
  | 'cadastro_negado'
  | 'login_ok'
  | 'cadastro_ok'
  | 'conta_criada_no_aceite'

/**
 * Registra um evento de auth. `telefoneE164` é hasheado (sha256) antes de gravar;
 * passe null quando o evento não tiver telefone. `detalhes` NUNCA deve conter PII.
 * Best-effort: a auditoria não derruba o fluxo principal se a inserção falhar.
 */
export async function registrarEventoAuth(
  ex: Executor,
  tipo: TipoEventoAuth,
  telefoneE164: string | null,
  detalhes?: Record<string, unknown>,
): Promise<void> {
  const hash = telefoneE164 ? sha256Hex(telefoneE164) : null
  await ex.query(
    `insert into public.eventos_auth (tipo, telefone_hash, detalhes) values ($1, $2, $3)`,
    [tipo, hash, detalhes ?? null],
  )
}

/** Tipos de auditoria de ACESSO (resolucao/negacao de escopo) do kernel F3. */
export type TipoEventoAcesso = 'login_ok' | 'login_negado'

/** Executor minimo para a auditoria de acesso (um Pool/PoolClient satisfaz). */
export interface ExecutorAuditoria {
  query(texto: string, valores: unknown[]): Promise<unknown>
}

/**
 * Audita a resolucao ou a NEGACAO de escopo (F3, etapa 10). Append-only, SEM PII: o
 * usuario entra apenas como sha256 em `detalhes.sujeito` (irreversivel, para correlacao),
 * nunca o UUID cru nem telefone. `motivo` e um rotulo curto e estavel, sem dado sensivel.
 *
 * BEST-EFFORT: falha de auditoria nunca derruba a requisicao (a seguranca ja decidiu;
 * o log e consequencia). Por isso engole o erro aqui dentro.
 */
export async function registrarEventoAcesso(
  ex: ExecutorAuditoria,
  tipo: TipoEventoAcesso,
  userId: string | null,
  motivo: string,
  detalhesExtra?: Record<string, unknown>,
): Promise<void> {
  const detalhes = {
    motivo,
    ...(userId ? { sujeito: sha256Hex(userId) } : {}),
    ...(detalhesExtra ?? {}),
  }
  try {
    await ex.query(
      `insert into public.eventos_auth (tipo, telefone_hash, detalhes) values ($1, null, $2)`,
      [tipo, detalhes],
    )
  } catch {
    // auditoria e best-effort: nunca propaga
  }
}
