// Fiacao de PRODUCAO das dependencias do modulo (cifra da chave + validadores de provedor).
//
// A `LLM_MASTER_KEY` e a master key PROPRIA da cifra de chaves de LLM, distinta da `MASTER_KEY`
// (token da Meta): separacao de dominio por chave mestra (ver cifra.ts). Nao esta no
// `envApiSchema` (fora do escopo desta tarefa), entao e lida aqui, pontualmente, de
// `process.env` com validacao Zod local, no mesmo molde do `config.ts` de numeros_whatsapp.
// PROPOSTA de promocao para `envApiSchema` registrada no relatorio: `LLM_MASTER_KEY`.
//
// A resolucao e PREGUICOSA (so no primeiro uso real): o registro do modulo no boot nunca quebra
// por falta da var; quem nao a configurou so falha ao chamar a rota de escrita/teste.
import { z } from 'zod'
import { criarCifraLlm } from './cifra'
import { criarValidadoresProducao } from './provedores'
import type { DepsConfigLlm } from './service'

const llmSchema = z.object({
  LLM_MASTER_KEY: z.string().min(32, 'minimo 32 caracteres'),
})

/** Monta as deps de producao (lanca se faltar a master key). */
export function depsDeProducao(): DepsConfigLlm {
  const parsed = llmSchema.safeParse(process.env)
  if (!parsed.success) {
    // Mensagem sem valor: so o nome da var (o valor seria o proprio segredo).
    throw new Error('LLM_MASTER_KEY ausente ou invalida (minimo 32 caracteres)')
  }
  return {
    cifra: criarCifraLlm(parsed.data.LLM_MASTER_KEY),
    validadores: criarValidadoresProducao(),
  }
}
