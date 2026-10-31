// Cifra das credenciais de plataforma (numero oficial do WhatsApp + e-mail transacional) =
// kernel compartilhado @whaviso/shared/cifra. Reusa a MESMA MASTER_KEY do token da Meta/chave
// Pix (ja no envApiSchema), em vez de uma master key propria: sao segredos de operacao da
// propria plataforma (nao segredo de cliente, como a chave de LLM), entao nao ha o mesmo motivo
// de separacao de dominio de credenciais_llm.
//
// SO CIFRA, nunca decifra: a api e write-only (so grava); quem decifra e o zap, que precisa usar
// as credenciais para enviar. Por isso este adaptador NAO expoe `decifrar`.
import { criarCifra, ErroCifra } from '@whaviso/shared/cifra'

export { ErroCifra }

export interface CifraCredenciaisPlataforma {
  cifrar(claro: string): Buffer
}

/** Cria a cifra das credenciais de plataforma a partir da MASTER_KEY (min 32 chars). */
export function criarCifraCredenciaisPlataforma(masterKey: string): CifraCredenciaisPlataforma {
  const cifra = criarCifra(masterKey)
  return {
    cifrar: (claro: string): Buffer => cifra.cifrar(Buffer.from(claro, 'utf8')),
  }
}
