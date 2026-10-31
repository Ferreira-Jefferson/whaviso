// Regra do modulo. Sem acesso HTTP aqui; erros de dominio via shared/http_errors (nenhum usado
// hoje: as duas rotas de escrita so cifram e gravam, sem regra de negocio adicional).
//
// Fluxo de segredo: o valor em claro (token/api key) existe SO dentro destas funcoes, o tempo
// minimo para ser cifrado; nunca e devolvido, logado nem persistido em claro.
import type { Executor } from '@whaviso/shared/db'
import type { CifraCredenciaisPlataforma } from './cripto'
import * as repo from './repo'
import type {
  EmailPlataformaEntrada, EmailPlataformaStatus, WhatsappOficialEntrada, WhatsappOficialStatus,
} from './schemas'

export interface DepsCredenciaisPlataforma {
  cifra: CifraCredenciaisPlataforma
}

export async function statusWhatsappOficial(exec: Executor): Promise<WhatsappOficialStatus> {
  return repo.statusWhatsappOficial(exec)
}

/** Set/rotate da credencial do numero oficial (cifra em repouso; o token nunca volta nem e logado). */
export async function definirWhatsappOficial(
  exec: Executor,
  deps: DepsCredenciaisPlataforma,
  entrada: WhatsappOficialEntrada,
): Promise<WhatsappOficialStatus> {
  const accessTokenCifrado = deps.cifra.cifrar(entrada.access_token)
  return repo.definirWhatsappOficial(exec, {
    phoneNumberId: entrada.phone_number_id,
    wabaId: entrada.waba_id,
    accessTokenCifrado,
  })
}

export async function statusEmailPlataforma(exec: Executor): Promise<EmailPlataformaStatus> {
  return repo.statusEmailPlataforma(exec)
}

/** Set/rotate da credencial de e-mail (cifra em repouso; a chave nunca volta nem e logada). */
export async function definirEmailPlataforma(
  exec: Executor,
  deps: DepsCredenciaisPlataforma,
  entrada: EmailPlataformaEntrada,
): Promise<EmailPlataformaStatus> {
  const apiKeyCifrada = deps.cifra.cifrar(entrada.api_key)
  return repo.definirEmailPlataforma(exec, { remetente: entrada.remetente, apiKeyCifrada })
}
