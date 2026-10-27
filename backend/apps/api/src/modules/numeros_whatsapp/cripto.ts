// Cifra do token da Meta (segredo em repouso) = kernel compartilhado @whaviso/shared/cifra.
//
// O formato (versao|nonce|tag|ciphertext) e a derivacao da chave a partir da MASTER_KEY sao
// UNICOS no monorepo: a api cifra o token aqui e o zap decifra com a MESMA MASTER_KEY. Antes
// este arquivo derivava a chave como sha256(MASTER_KEY); agora delega ao kernel (sha256 com
// separacao de dominio), de modo que api e zap interoperem. A MASTER_KEY vem de fora (env),
// NUNCA do codigo e NUNCA do log.
//
// A interface local `Cripto` (texto em string) e so um adaptador fino sobre o kernel (Buffer),
// mantida para o service e os testes deste modulo continuarem lidando com o token como string.
import { criarCifra, ErroCifra } from '@whaviso/shared/cifra'

export { ErroCifra }

/** Cifra simetrica autenticada do token (string): cifra e decifra, sem jamais expor a chave. */
export interface Cripto {
  cifrar(claro: string): Buffer
  decifrar(cifrado: Buffer): string
}

/** Cria a cifra do token a partir da MASTER_KEY (min 32 chars). Injete a chave nos testes. */
export function criarCripto(masterKey: string): Cripto {
  const cifra = criarCifra(masterKey)
  return {
    cifrar: (claro: string): Buffer => cifra.cifrar(Buffer.from(claro, 'utf8')),
    decifrar: (cifrado: Buffer): string => cifra.decifrar(cifrado).toString('utf8'),
  }
}
