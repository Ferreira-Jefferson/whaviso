// Cifra da chave Pix (segredo em repouso) = kernel compartilhado @whaviso/shared/cifra.
//
// Mesmo molde do token da Meta (numeros_whatsapp/cripto.ts): a chave Pix em claro é cifrada
// aqui pela api e nunca persiste em claro. O formato (versao|nonce|tag|ciphertext) e a
// derivação da chave a partir da MASTER_KEY são ÚNICOS no monorepo, então api e atendente
// decifram com a MESMA MASTER_KEY. A MASTER_KEY vem de fora (env), NUNCA do código nem do log.
//
// A interface local `Cripto` (texto em string) é um adaptador fino sobre o kernel (Buffer),
// para o service lidar com a chave Pix como string.
import { criarCifra, ErroCifra } from '@whaviso/shared/cifra'

export { ErroCifra }

/** Cifra simétrica autenticada da chave Pix (string): cifra e decifra, sem jamais expor a chave. */
export interface Cripto {
  cifrar(claro: string): Buffer
  decifrar(cifrado: Buffer): string
}

/** Cria a cifra da chave Pix a partir da MASTER_KEY (min 32 chars). Injete a chave nos testes. */
export function criarCripto(masterKey: string): Cripto {
  const cifra = criarCifra(masterKey)
  return {
    cifrar: (claro: string): Buffer => cifra.cifrar(Buffer.from(claro, 'utf8')),
    decifrar: (cifrado: Buffer): string => cifra.decifrar(cifrado).toString('utf8'),
  }
}
