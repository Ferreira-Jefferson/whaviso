// Acesso a dados do modulo: SO via @whaviso/shared/db, sempre com sql`...` (parametrizado).
//
// REGRA DE SEGREDO (SEC-020/023): as colunas cifradas (`access_token_cifrado`,
// `api_key_cifrada`) NUNCA entram nas projecoes de status. A api e write-only sobre elas: so
// grava (upsert), nunca seleciona de volta (quem decifra e o zap, em outro processo/role).
import { consultarUm, sql, type Executor } from '@whaviso/shared/db'

// ---- WhatsApp oficial (singleton; id = 1) ----------------------------------------------------

export interface StatusWhatsappOficial {
  configurada: boolean
  phone_number_id: string | null
  waba_id: string | null
  atualizado_em: string
}

interface LinhaStatusWhatsapp {
  phone_number_id: string | null
  waba_id: string | null
  access_token_cifrado: Buffer | null
  atualizado_em: Date | string
}

function iso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : String(v)
}

function paraStatusWhatsapp(l: LinhaStatusWhatsapp): StatusWhatsappOficial {
  return {
    configurada: l.access_token_cifrado != null,
    phone_number_id: l.phone_number_id,
    waba_id: l.waba_id,
    atualizado_em: iso(l.atualizado_em),
  }
}

/** Metadado da credencial do numero oficial (NUNCA o token): existe, numeros, quando mudou. */
export async function statusWhatsappOficial(exec: Executor): Promise<StatusWhatsappOficial> {
  const linha = await consultarUm<LinhaStatusWhatsapp>(
    exec,
    sql`select phone_number_id, waba_id, access_token_cifrado, atualizado_em
          from public.credenciais_whatsapp_oficial where id = 1`,
  )
  // A linha nasce semeada pela migration; ausencia seria so se a migration nao rodou.
  return paraStatusWhatsapp(linha!)
}

/** Set/rotate da credencial do numero oficial (cifra em repouso). RETURNING so o metadado. */
export async function definirWhatsappOficial(
  exec: Executor,
  d: { phoneNumberId: string; wabaId: string | null; accessTokenCifrado: Buffer },
): Promise<StatusWhatsappOficial> {
  const linha = await consultarUm<LinhaStatusWhatsapp>(
    exec,
    sql`update public.credenciais_whatsapp_oficial set
          phone_number_id = ${d.phoneNumberId},
          waba_id = ${d.wabaId},
          access_token_cifrado = ${d.accessTokenCifrado}
        where id = 1
        returning phone_number_id, waba_id, access_token_cifrado, atualizado_em`,
  )
  return paraStatusWhatsapp(linha!)
}

// ---- E-mail transacional (singleton; id = 1) --------------------------------------------------

export interface StatusEmailPlataforma {
  configurada: boolean
  remetente: string | null
  atualizado_em: string
}

interface LinhaStatusEmail {
  remetente: string | null
  api_key_cifrada: Buffer | null
  atualizado_em: Date | string
}

function paraStatusEmail(l: LinhaStatusEmail): StatusEmailPlataforma {
  return {
    configurada: l.api_key_cifrada != null,
    remetente: l.remetente,
    atualizado_em: iso(l.atualizado_em),
  }
}

/** Metadado da credencial de e-mail (NUNCA a chave): existe, remetente, quando mudou. */
export async function statusEmailPlataforma(exec: Executor): Promise<StatusEmailPlataforma> {
  const linha = await consultarUm<LinhaStatusEmail>(
    exec,
    sql`select remetente, api_key_cifrada, atualizado_em from public.credenciais_email_plataforma where id = 1`,
  )
  return paraStatusEmail(linha!)
}

/** Set/rotate da credencial de e-mail (cifra em repouso). RETURNING so o metadado. */
export async function definirEmailPlataforma(
  exec: Executor,
  d: { remetente: string; apiKeyCifrada: Buffer },
): Promise<StatusEmailPlataforma> {
  const linha = await consultarUm<LinhaStatusEmail>(
    exec,
    sql`update public.credenciais_email_plataforma set
          remetente = ${d.remetente},
          api_key_cifrada = ${d.apiKeyCifrada}
        where id = 1
        returning remetente, api_key_cifrada, atualizado_em`,
  )
  return paraStatusEmail(linha!)
}
