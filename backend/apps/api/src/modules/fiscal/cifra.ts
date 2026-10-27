// Cifra da credencial do emissor fiscal = kernel compartilhado @whaviso/shared/cifra
// (AES-256-GCM, formato versionado, nonce aleatorio por chamada).
//
// Diferente da chave de LLM, a api PRECISA decifrar: e ela quem chama o emissor de terceiro
// (mesmo molde de numeros_whatsapp.token_cifrado). O texto claro existe so o tempo da chamada e
// vive dentro de `CredencialResolvida` (opaca: nao vaza por log/serializacao).
// A master key e PROPRIA do dominio fiscal (`FISCAL_MASTER_KEY`), separada das demais.
import { criarCifra, ErroCifra } from '@whaviso/shared/cifra'
import { CredencialResolvida } from '@whaviso/shared/clientes'

export { ErroCifra }

export interface CifraFiscal {
  cifrar(credencialClara: string): Buffer
  /** Decifra e embrulha em credencial opaca. Lanca ErroCifra se adulterada ou chave errada. */
  decifrar(cifrado: Buffer): CredencialResolvida
}

export function criarCifraFiscal(masterKey: string): CifraFiscal {
  const cifra = criarCifra(masterKey)
  return {
    cifrar: (clara) => cifra.cifrar(Buffer.from(clara, 'utf8')),
    decifrar: (cifrado) => new CredencialResolvida(cifra.decifrar(cifrado).toString('utf8')),
  }
}
