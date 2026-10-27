// Decifra da chave de LLM da loja (o segredo mais caro do banco), espelho EXATO da cifra da api.
//
// A api (apps/api/src/modules/configuracoes_llm/cifra.ts) CIFRA a chave com o kernel compartilhado
// `@whaviso/shared/cifra` (`criarCifra(masterKey).cifrar(...)`), que usa AES-256-GCM com o dominio
// de separacao `whaviso/cifra/v1` (fixo no kernel) e formato versionado. Aqui DECIFRAMOS com o
// MESMO kernel e a MESMA master key, ou a autenticacao GCM falha:
//   - mesma funcao: `criarCifra` de `@whaviso/shared/cifra` (dominio `whaviso/cifra/v1`);
//   - mesma master key: `LLM_MASTER_KEY` (distinta da `MASTER_KEY` do token da Meta, por separacao
//     de dominio por chave mestra: um comprometimento de uma nao expoe a outra).
// So o processo do atendente recebe a `LLM_MASTER_KEY`; api e zap nunca a leem (SEC-021/022).
//
// A `LLM_MASTER_KEY` ainda nao esta no `envAtendenteSchema` (fora do escopo deste modulo), entao e
// lida aqui, pontualmente, de `process.env` com validacao Zod local, no mesmo molde do `config.ts`
// de configuracoes_llm na api. PROPOSTA de promocao para `envAtendenteSchema`: `LLM_MASTER_KEY`.
import { z } from 'zod'
import { criarCifra, ErroCifra } from '@whaviso/shared/cifra'

export { ErroCifra }

/** Decifra da chave de LLM. SO decifra (o atendente nunca cifra a chave; quem cifra e a api). */
export interface DecifraLlm {
  /** Inverso de `CifraLlm.cifrar` da api: bytes versionados -> chave em claro (utf8). Lanca ErroCifra. */
  decifrarParaTexto(cifrado: Buffer): string
}

/** Cria a decifra a partir da `LLM_MASTER_KEY` (min 32 chars). Injetavel em teste sem env. */
export function criarDecifraLlm(masterKey: string): DecifraLlm {
  const cifra = criarCifra(masterKey) // mesmo kernel/dominio que a api usou para cifrar
  return {
    decifrarParaTexto: (cifrado: Buffer): string => cifra.decifrar(cifrado).toString('utf8'),
  }
}

const llmSchema = z.object({ LLM_MASTER_KEY: z.string().min(32, 'minimo 32 caracteres') })

// Default preguicoso: le a master key no primeiro uso real. O registro/boot do atendente nao
// quebra por falta da var; so uma chamada que de fato precise decifrar falha (fechada).
let cache: DecifraLlm | undefined

/** Decifra padrao do processo, derivada de `process.env.LLM_MASTER_KEY` (lazy, cacheada). */
export function decifraPadrao(): DecifraLlm {
  if (!cache) {
    const parsed = llmSchema.safeParse(process.env)
    if (!parsed.success) {
      // Mensagem sem valor: so o nome da var (o valor seria a propria master key).
      throw new ErroCifra('LLM_MASTER_KEY ausente ou invalida (minimo 32 caracteres)')
    }
    cache = criarDecifraLlm(parsed.data.LLM_MASTER_KEY)
  }
  return cache
}
