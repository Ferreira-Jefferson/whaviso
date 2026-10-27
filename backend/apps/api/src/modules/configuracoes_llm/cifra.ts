// Cifra da chave de LLM (segredo mais caro do banco) = kernel compartilhado
// @whaviso/shared/cifra (AES-256-GCM, formato versionado, nonce aleatorio por chamada).
//
// SO CIFRA, nunca decifra: a api e write-only sobre a chave (grant por coluna barra o SELECT
// de chave_cifrada; SEC-021). Quem decifra e o worker atendente, em outro processo/role, com
// a mesma master key. Por isso este adaptador NAO expoe `decifrar`: um teste de import garante
// que a api nao carrega a funcao de decifrar (SEC-022, apoio).
//
// SEPARACAO DE DOMINIO: a chave de LLM usa uma master key PROPRIA (`LLM_MASTER_KEY`), distinta
// da `MASTER_KEY` do token da Meta. Assim o material derivado de um dominio nunca serve ao
// outro: um comprometimento de uma chave mestra nao expoe o outro segredo. A master key vem
// SEMPRE de fora (env/secret manager), NUNCA do codigo e NUNCA do log.
import { criarCifra, ErroCifra } from '@whaviso/shared/cifra'

export { ErroCifra }

/** Cifra simetrica autenticada da chave de LLM. Apenas cifra (write-only na api). */
export interface CifraLlm {
  /** Cifra a chave (string utf8) em bytes versionados prontos para a coluna bytea. */
  cifrar(chaveClara: string): Buffer
}

/** Cria a cifra da chave de LLM a partir da `LLM_MASTER_KEY` (min 32 chars). Injetavel em teste. */
export function criarCifraLlm(masterKey: string): CifraLlm {
  const cifra = criarCifra(masterKey)
  return {
    cifrar: (chaveClara: string): Buffer => cifra.cifrar(Buffer.from(chaveClara, 'utf8')),
  }
}
