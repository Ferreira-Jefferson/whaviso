// Resolve a credencial de um numero (phone_number_id + token) e o destino (telefone do
// cliente) SO no instante do envio: decifra token_cifrado e telefone_cifrado com o kernel
// de cifra (@whaviso/shared/cifra, a MESMA MASTER_KEY da api) e embrulha o token numa
// CredencialResolvida opaca, que so revela o segredo no header de auth (SEC-024/SEC-026).
import { CredencialResolvida, type NumeroWhats } from '@whaviso/shared/clientes'
import type { Cifra } from '@whaviso/shared/cifra'

/** Linha minima de `numeros_whatsapp` que o dreno le (nunca projeta o token em log). */
export interface LinhaNumero {
  phone_number_id: string
  token_cifrado: Buffer | null
  status: string
}

/**
 * Monta o NumeroWhats (phoneNumberId + credencial) decifrando o token no uso. Devolve null
 * se o numero nao tem token (nao conectado): o chamador trata como credencial invalida, sem
 * chamar a Meta. O token em claro vive so dentro da CredencialResolvida, nunca numa variavel
 * solta nem num log.
 */
export function resolverNumero(linha: LinhaNumero, cifra: Cifra): NumeroWhats | null {
  if (!linha.token_cifrado) return null
  const token = cifra.decifrar(linha.token_cifrado).toString('utf8')
  return { phoneNumberId: linha.phone_number_id, credencial: new CredencialResolvida(token) }
}

/** Decifra o telefone do destinatario (E.164) a partir de `clientes.telefone_cifrado`. */
export function resolverDestino(telefoneCifrado: Buffer | null, cifra: Cifra): string | null {
  if (!telefoneCifrado) return null
  return cifra.decifrar(telefoneCifrado).toString('utf8')
}
