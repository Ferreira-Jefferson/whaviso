// Leitura das credenciais de plataforma (admin em /plataforma/configuracoes; migration 0096).
// SO leitura (o zap nunca escreve estas tabelas); decifra com a MESMA MASTER_KEY da api (kernel
// @whaviso/shared/cifra). Lido a cada tick (nao uma vez no boot): a troca feita pelo admin vale
// no proximo tick, sem reiniciar o processo.
import { consultarUm, sql, type Pool } from '@whaviso/shared/db'
import type { Cifra } from '@whaviso/shared/cifra'

export interface CredencialEmailPlataforma {
  remetente: string
  apiKey: string
}

/** Credencial de e-mail (Resend) decifrada, ou null se o admin ainda nao configurou. */
export async function lerCredencialEmailPlataforma(
  pool: Pool,
  cifra: Cifra,
): Promise<CredencialEmailPlataforma | null> {
  const linha = await consultarUm<{ remetente: string | null; api_key_cifrada: Buffer | null }>(
    pool,
    sql`select remetente, api_key_cifrada from public.credenciais_email_plataforma where id = 1`,
  )
  if (!linha?.api_key_cifrada || !linha.remetente) return null
  return { remetente: linha.remetente, apiKey: cifra.decifrar(linha.api_key_cifrada).toString('utf8') }
}
